import type TelegramBot from "node-telegram-bot-api";
import db from "./db";
import { ObjectId } from "mongodb";
import { translate } from "../i18n/i18n";

interface CachedPlan {
  hasPlan: boolean;
  plan?: Plan;
  cachedAt: number;
}

// Cache for plan status - stores userId -> plan data
const planCache = new Map<number, CachedPlan>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export const registerGroup = async (chat: TelegramBot.Chat) => {
  await db.collection("groups").createIndex("id", { unique: true });

  await db.collection("groups").updateOne({ id: chat.id }, { $set: chat }, { upsert: true });
};

export const registerUserInGroup = async (user: TelegramBot.User, chat: TelegramBot.Chat) => {
  await db.collection("users").createIndex("id", { unique: true });

  const opUser = await db.collection("users").updateOne({ id: user.id }, { $set: user }, { upsert: true });
  await db.collection("groups").updateOne(
    { id: chat.id },
    {
      $addToSet: {
        members: user.id,
      },
    }
  );

  return opUser;
};

export const getGroupById = async (groupId: number) => {
  const group = (
    await db
      .collection("groups")
      .aggregate([
        { $match: { id: groupId } },
        {
          $lookup: {
            from: "users",
            localField: "members",
            foreignField: "id",
            as: "members",
          },
        },
        { $unwind: "$members" },
        {
          $sort: {
            "members.first_name": 1,
          },
        },
        {
          $group: {
            _id: "$_id",
            member: { $first: "$$ROOT" },
            members: {
              $push: "$members",
            },
          },
        },
        {
          $replaceRoot: { newRoot: { $mergeObjects: ["$member", { members: "$members" }] } },
        },
        { $limit: 1 },
      ])
      .toArray()
  ).pop();

  return group as Group;
};

export const groupMembers = async (group: TelegramBot.Chat) => {
  const groupInfo = await getGroupById(group.id);

  return groupInfo?.members as TelegramBot.User[];
};

export const getGroups = async (user: TelegramBot.User) => {
  return await db
    .collection("groups")
    .aggregate([
      { $match: { members: user.id } },
      {
        $lookup: {
          from: "users",
          localField: "members",
          foreignField: "id",
          as: "members",
        },
      },
      { $unwind: "$members" },
      {
        $sort: {
          "members.first_name": 1,
        },
      },
      {
        $group: {
          _id: "$_id",
          member: { $first: "$$ROOT" },
          members: {
            $push: "$members",
          },
        },
      },
      {
        $replaceRoot: { newRoot: { $mergeObjects: ["$member", { members: "$members" }] } },
      },
    ])
    .toArray();
};

export const addSplit = async (data: TransactionData) => {
  await db.collection("splits").createIndex("group");
  await db.collection("splits").createIndex("from");
  await db.collection("splits").createIndex("date");

  let splits = data.splits;
  
  // Calculate individual shares based on receipt items if present
  if (data.receiptItems) {
    const memberShares: Record<string, number> = {};
    const totalCharges = (data.serviceCharge || 0) + (data.serviceTax || 0);
    const subtotal = data.receiptItems.reduce((sum, item) => sum + item.totalPrice, 0);
    
    data.receiptItems.forEach(item => {
      const itemShare = item.totalPrice / subtotal; // proportion of total bill
      const itemCharges = totalCharges * itemShare; // proportional charges for this item
      const shareAmount = (item.totalPrice + itemCharges) / item.assignedTo.length;
      
      item.assignedTo.forEach(memberId => {
        memberShares[memberId] = (memberShares[memberId] || 0) + shareAmount;
      });
    });

    // Convert shares to splits format
    const users = await Promise.all(
      Object.entries(memberShares).map(async ([memberId, amount]) => {
        const user = await db.collection("users").findOne({ id: parseInt(memberId) });
        return { ...user, amount, selected: true } as UserSplit;
      })
    );
    splits = users;
  }

  return await db.collection("splits").insertOne({
    group: data.group.id,
    date: new Date(),
    from: data.from.id,
    description: data.description,
    amount: data.amount,
    mode: data.receiptItems ? "unequally" : data.mode,
    splits: splits?.filter((s) => s.selected).map((s) => ({ 
      user: s.id || s.user, 
      amount: s.amount 
    })),
    receiptItems: data.receiptItems,
    serviceCharge: data.serviceCharge,
    serviceTax: data.serviceTax
  });
};

export const editSplit = async (id: string, data: TransactionData) => {
  return await db.collection("splits").updateOne(
    {
      _id: new ObjectId(id),
    },
    {
      $set: {
        group: data.group.id,
        from: data.from.id,
        description: data.description,
        amount: data.amount,
        mode: data.mode,
        splits: data.splits?.filter((s) => s.selected).map((s) => ({ user: s.id, amount: data.mode === "equally" ? null : s.amount })),
      },
    }
  );
};

export const deleteSplit = async (id: string) => {
  return await db.collection("splits").deleteOne({
    _id: new ObjectId(id),
  });
};

export const addPayment = async (data: TransactionData) => {
  await db.collection("payments").createIndex("group");
  await db.collection("payments").createIndex("from");
  await db.collection("payments").createIndex("date");
  await db.collection("payments").createIndex("to");

  return await db.collection("payments").insertOne({
    group: data.group.id,
    date: new Date(),
    from: data.from.id,
    to: data.to?.id,
    amount: data.amount,
  });
};

export const editPayment = async (id: string, data: TransactionData) => {
  return await db.collection("payments").updateOne(
    {
      _id: new ObjectId(id),
    },
    {
      $set: {
        group: data.group.id,
        from: data.from.id,
        to: data.to?.id,
        amount: data.amount,
      },
    }
  );
};

export const deletePayment = async (id: string) => {
  return await db.collection("payments").deleteOne({
    _id: new ObjectId(id),
  });
};

export const getSplits = async (group: Group) => {
  if (!group) return [];

  const splits = await db
    .collection("splits")
    .aggregate([
      { $match: { group: group.id } },
      {
        $lookup: {
          from: "users",
          localField: "from",
          foreignField: "id",
          as: "from",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "splits.user",
          foreignField: "id",
          as: "splitUsers",
        },
      },
      {
        $project: {
          date: 1,
          description: 1,
          amount: 1,
          mode: 1,
          from: 1,
          splits: {
            $map: {
              input: "$splits",
              as: "amounts",
              in: {
                $mergeObjects: [
                  "$$amounts",
                  { selected: true },
                  {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$splitUsers",
                          as: "users",
                          cond: {
                            $eq: ["$$users.id", "$$amounts.user"],
                          },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      { $unwind: "$from" },
      { $sort: { date: -1 } },
    ])
    .toArray();

  return splits as TransactionData[];
};

export const getPayments = async (group: Group) => {
  if (!group) return [];

  const payments = await db
    .collection("payments")
    .aggregate([
      { $match: { group: group.id } },
      {
        $lookup: {
          from: "users",
          localField: "from",
          foreignField: "id",
          as: "from",
        },
      },
      { $unwind: "$from" },
      {
        $lookup: {
          from: "users",
          localField: "to",
          foreignField: "id",
          as: "to",
        },
      },
      { $unwind: "$to" },
      { $sort: { date: -1 } },
    ])
    .toArray();

  return payments as TransactionData[];
};

function getMaxAndMin(amount: Record<string, number>) {
  let maxIndex: string | null = null;
  let minIndex: string | null = null;

  Object.entries(amount).forEach(([index, value]) => {
    if (maxIndex === null) maxIndex = index;
    if (minIndex === null) minIndex = index;

    if (value >= amount[maxIndex]) maxIndex = index;
    if (value <= amount[minIndex]) minIndex = index;
  });

  return [maxIndex, minIndex];
}

function calculateMinCashGraph(amount: Record<string, number>, transactions = {} as Record<string, Record<string, number>>) {
  const [mxCredit, mxDebit] = getMaxAndMin(amount);

  if (!mxCredit || !mxDebit) return transactions;
  

  if (floorAmount(amount[mxCredit]) === 0 || floorAmount(amount[mxDebit]) === 0) return transactions;

  const min = floorAmount(Math.min(-amount[mxDebit], amount[mxCredit]));

  amount[mxCredit] -= min;
  amount[mxDebit] += min;

  if (!transactions[mxDebit]) transactions[mxDebit] = {};
  if (!transactions[mxCredit]) transactions[mxCredit] = {};
  transactions[mxDebit][mxCredit] = min;
  transactions[mxCredit][mxDebit] = -min;

  return calculateMinCashGraph(amount, transactions);
}

function minCashGraph(graph: Record<string, Record<string, number>>) {
  const amount = {} as Record<string, number>;

  console.log(graph)

  Object.keys(graph).forEach((fromId) => {
    amount[fromId] = amount[fromId] || 0;
    Object.keys(graph).forEach((toId) => {
      amount[fromId] += (graph[toId][fromId] || 0) - (graph[fromId][toId] || 0);
    });
  });

  console.log(amount)

  return calculateMinCashGraph(amount);
}

function floorAmount(amount: number) {
  return Math.round(amount * 100) / 100;
}

export const simplifyTransactions = async (group: Group, splits: TransactionData[] | null = null, payments: TransactionData[] | null = null) => {
  splits = splits || ((await getSplits(group)) as TransactionData[]);
  payments = payments || ((await getPayments(group)) as TransactionData[]);

  const groupMembers = group.members
    .sort((a, b) => a.first_name.localeCompare(b.first_name))
    .reduce((g, m) => {
      g[m.id] = m;

      return g;
    }, {} as Record<string, TelegramBot.User>);

  const usersGraph = {} as Record<string, Record<string, number>>;
  Object.keys(groupMembers).forEach((fromId) => {
    usersGraph[fromId] = {};
    Object.keys(groupMembers).forEach((toId) => {
      if (fromId !== toId) usersGraph[fromId][toId] = 0;
    });
  });

  const allTransactions = [] as TransactionGraph[];

  console.log(splits)

  splits.forEach((split) => {
    const sumShares = split.mode === "shares" ? split.splits?.reduce((t, u) => (t += u.selected ? u.amount || 0 : 0), 0) || 0 : 0;
    const totalSplits = split.splits?.length || 0;

    split.splits?.forEach((member) => {
      const trans = { to: split.from, from: { ...member, selected: undefined, amount: undefined, user: undefined }, amount: 0 };

      if (split.mode === "equally") trans.amount = split.amount / totalSplits;
      else if (split.mode === "unequally") trans.amount = member.amount || 0;
      else if (split.mode === "percentages") trans.amount = (split.amount * (member.amount || 0)) / 100;
      else if (split.mode === "shares") trans.amount = (split.amount * (member.amount || 0)) / sumShares;

      if (trans.from.id !== trans.to.id && trans.amount && trans.amount > 0) allTransactions.push(trans);
    });
  });

  payments.forEach((payment) => {
    if (payment.to && payment.from.id !== payment.to?.id && payment.amount && payment.amount > 0) allTransactions.push({ to: payment.from, from: payment.to, amount: payment.amount });
  });

  allTransactions.forEach((transaction) => {
    usersGraph[transaction.from.id][transaction.to.id] += transaction.amount;
  });

  console.log(allTransactions);

  const simplifiedGraph = minCashGraph(usersGraph);

  console.log(simplifiedGraph);

  const finalGraph = [] as GraphData[];

  group.members.forEach((member) => {
    const graph = { ...member, debts: [] } as GraphData;

    Object.entries(simplifiedGraph[member.id] || {}).forEach(([toId, amount]) => {
      graph.debts.push({ ...groupMembers[toId], amount });
    });

    if (graph.debts.length > 0) finalGraph.push(graph);
  });

  return finalGraph.sort((a, b) => a.first_name.localeCompare(b.first_name));
};

// Plan types and interfaces
export type PlanType = 'weekend' | 'vacation' | 'extended';

export interface Plan {
  type: PlanType;
  started_at: Date;
  expires_at: Date;
}

// Plan limits
export const PLAN_LIMITS = {
  weekend: {
    maxTravelers: 4,
    maxScans: 50,
    maxDays: 3,
    maxTrips: 1
  },
  vacation: {
    maxTravelers: 8,
    maxScans: 200,
    maxDays: 7,
    maxTrips: 2
  },
  extended: {
    maxTravelers: 15,
    maxScans: Infinity,
    maxDays: 14,
    maxTrips: 5
  }
} as const;

// Check user's plan status with caching
export const checkUserPlan = async (userId: number): Promise<{ hasPlan: boolean; plan?: Plan }> => {
  const now = new Date();
  const cached = planCache.get(userId);

  // Check if we have a valid cached result
  if (cached && (now.getTime() - cached.cachedAt) < CACHE_TTL) {
    console.log("Using cached plan data for user:", userId);
    return { hasPlan: cached.hasPlan, plan: cached.plan };
  }

  console.log("Checking plan in database for user:", userId);
  
  // Query database for fresh data
  const user = await db.collection("users").findOne({
    id: userId,
    'plan.expires_at': { $gt: now }
  });
  
  console.log("User data from MongoDB:", JSON.stringify(user, null, 2));
  
  let result: { hasPlan: boolean; plan?: Plan };
  
  if (!user?.plan) {
    console.log("No active plan found for user");
    result = { hasPlan: false };
  } else {
    // Parse the plan data
    const plan = {
      type: user.plan.type as PlanType,
      started_at: new Date(user.plan.started_at),
      expires_at: new Date(user.plan.expires_at)
    };

    console.log("Active plan found:", {
      type: plan.type,
      started_at: plan.started_at.toISOString(),
      expires_at: plan.expires_at.toISOString()
    });
    
    result = { hasPlan: true, plan };
  }

  // Cache the result
  planCache.set(userId, {
    ...result,
    cachedAt: now.getTime()
  });

  return result;
};

// Add function to invalidate cache when plan changes
export const invalidatePlanCache = (userId: number) => {
  console.log("Invalidating plan cache for user:", userId);
  planCache.delete(userId);
};

// Get user's remaining limits
export const getUserPlanLimits = async (userId: number) => {
  console.log("Getting plan limits for user:", userId);
  const { hasPlan, plan } = await checkUserPlan(userId);
  
  if (!hasPlan || !plan) {
    console.log("No active plan found for limits");
    return null;
  }

  const limits = PLAN_LIMITS[plan.type];
  
  // Get usage stats from the database
  const stats = await db.collection("usage_stats").findOne({ userId });
  console.log("Usage stats from MongoDB:", stats);

  const defaultStats = {
    scans: 0,
    trips: 0,
    travelers: 0
  };

  const currentStats = stats || defaultStats;
  console.log("Current stats:", currentStats);

  return {
    scansRemaining: limits.maxScans === Infinity ? Infinity : limits.maxScans - (currentStats.scans || 0),
    tripsRemaining: limits.maxTrips - (currentStats.trips || 0),
    travelersRemaining: limits.maxTravelers - (currentStats.travelers || 0),
    daysRemaining: Math.ceil((plan.expires_at.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  };
};

// Update usage stats
export const updateUsageStats = async (userId: number, updates: { scans?: number; trips?: number; travelers?: number }) => {
  console.log("Updating usage stats for user:", userId, "Updates:", updates);
  const result = await db.collection("usage_stats").updateOne(
    { userId },
    {
      $inc: {
        scans: updates.scans || 0,
        trips: updates.trips || 0,
        travelers: updates.travelers || 0
      }
    },
    { upsert: true }
  );
  console.log("Usage stats update result:", result);
  return result;
};

// Check if user has access to a premium feature
export const checkPremiumAccess = async (userId: number, feature: 'scan' | 'trip' | 'travelers'): Promise<boolean> => {
  console.log(`Checking premium access for user ${userId}, feature: ${feature}`);
  const { hasPlan, plan } = await checkUserPlan(userId);
  
  // If user has any active plan, they should have access
  if (!hasPlan || !plan) {
    console.log('No active plan found');
    return false;
  }

  console.log('Active plan found:', plan.type);
  return true;

  // We don't need to check specific limits anymore since any active plan grants access
  /* const limits = await getUserPlanLimits(userId);
  if (!limits) {
    console.log('Failed to get plan limits');
    return false;
  }

  let hasAccess = false;
  switch (feature) {
    case 'scan':
      hasAccess = limits.scansRemaining > 0;
      break;
    case 'trip':
      hasAccess = limits.tripsRemaining > 0;
      break;
    case 'travelers':
      hasAccess = limits.travelersRemaining > 0;
      break;
  }

  console.log(`Access result for ${feature}: ${hasAccess}`);
  return hasAccess; */
};

// Update or set user's plan
export const updateUserPlan = async (userId: number, planType: PlanType): Promise<{ success: boolean; message?: string }> => {
  console.log(`Updating plan for user ${userId} to ${planType}`);
  
  try {
    const { hasPlan, plan } = await checkUserPlan(userId);
    const now = new Date();
    let startDate = now;
    
    if (hasPlan && plan && plan.expires_at > now) {
      startDate = plan.expires_at;
    }

    const daysToAdd = PLAN_LIMITS[planType].maxDays;
    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + daysToAdd);

    const result = await db.collection("users").updateOne(
      { id: userId },
      {
        $set: {
          plan: {
            type: planType,
            started_at: startDate,
            expires_at: expiryDate
          }
        }
      }
    );

    console.log('Plan update result:', result);

    if (result.matchedCount === 0) {
      return { success: false, message: "User not found" };
    }

    // Reset usage stats
    await db.collection("usage_stats").updateOne(
      { userId },
      {
        $set: {
          scans: 0,
          trips: 0,
          travelers: 0
        }
      },
      { upsert: true }
    );

    // Invalidate cache after update
    invalidatePlanCache(userId);

    return { 
      success: true,
      message: hasPlan ? "Plan upgraded" : "Plan activated"
    };
  } catch (error) {
    console.error('Error updating plan:', error);
    return { success: false, message: "Failed to update plan" };
  }
};

// Send expiration message
export const sendExpirationMessage = async (bot: any, userId: number, planType: string, isExpired: boolean = false) => {
  const message = isExpired ? 
    translate("default", "bot.plan_expired", { planType }) :
    translate("default", "bot.plan_expiring_soon", { planType });

  await bot.sendMessage(userId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [
        [{
          text: translate("default", "bot.get_premium"),
          url: `https://chopchopsplit.com/#pricing?user_id=${userId}`
        }]
      ]
    }
  });
};

// Add new interface for receipt scans
export interface ReceiptScan {
  userId: number;
  groupId: number;
  date: Date;
  success: boolean;
  items?: ReceiptItem[];
  summary?: {
    subtotal: number;
    total: number;
    serviceCharge?: number;
    serviceTax?: number;
  };
  metadata?: {
    storeName: string;
    date: string;
  };
}

// Add new function to save receipt scans
export const saveReceiptScan = async (scan: ReceiptScan) => {
  await db.collection("receipt_scans").createIndex("date");
  await db.collection("receipt_scans").createIndex("userId");
  await db.collection("receipt_scans").createIndex("groupId");
  
  return await db.collection("receipt_scans").insertOne(scan);
};
