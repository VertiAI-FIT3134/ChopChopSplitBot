import { env } from "$env/dynamic/private";
import TelegramBot from "node-telegram-bot-api";
import { translate } from "../i18n/i18n";
import { 
  getGroupById, 
  groupMembers, 
  registerGroup, 
  registerUserInGroup, 
  simplifyTransactions,
  checkUserPlan,
  getUserPlanLimits,
  PLAN_LIMITS,
  PlanType,
  checkPremiumAccess,
  updateUsageStats,
  sendExpirationMessage,
  addChildrenToPlan
} from "../db/interface";
import { formatUser, memberToList, pmd2 } from "./utils";
import { GeminiImageProcessor } from "../../../services/gemini-processor";
import { downloadTelegramFile } from "../utils/telegram-utils";
import fetch from "node-fetch";

// Lazy loaded instances
let botInstance: TelegramBot | null = null;
let baseHostValue: string | null = null;
let botTokenValue: string | null = null;

// Getter for bot token
function getBotToken() {
  if (!botTokenValue) {
    const token = env.BOT_TOKEN;
    if (!token) throw new Error("BOT_TOKEN is not set");
    botTokenValue = token;
  }
  return botTokenValue;
}

// Getter for base host
function getBaseHost() {
  if (!baseHostValue) {
    const host = env.APP_HOST;
    if (!host) throw new Error("APP_HOST is not set");
    baseHostValue = host;
  }
  return baseHostValue;
}

// Getter for bot instance
function getBot() {
  if (!botInstance) {
    botInstance = new TelegramBot(getBotToken());
    initializePing();
  }
  return botInstance;
}

// Initialize Gemini processor
const geminiProcessor = new GeminiImageProcessor();

// Store awaiting receipt users in a more persistent way
const state = {
  awaitingReceipt: new Set<number>()
};

// Export for testing/debugging
export const getState = () => state;

export const setWebhook = async () => {
  const webhookUrl = `${getBaseHost()}/bot`;
  console.log("Setting webhook to:", webhookUrl);
  const result = await getBot().setWebHook(webhookUrl);
  console.log("Webhook set result:", result);
  return result;
};

// Export bot for compatibility with existing code
export const bot = getBot();

function sendPrivateMessage(chatId: number, languageCode: string | undefined) {
  const message = translate(languageCode, "bot.add_to_group") + "\n\n" + 
                 translate(languageCode, "bot.help_message");
  
  getBot().sendMessage(chatId, message, {
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [
        [{ text: translate(languageCode, "bot.list_transactions"), web_app: { url: getBaseHost() + "/webapp/list" } }],
        [{ text: translate(languageCode, "bot.add_split"), web_app: { url: getBaseHost() + "/webapp/add-split" } }],
        [{ text: translate(languageCode, "bot.add_payment"), web_app: { url: getBaseHost() + "/webapp/add-payment" } }],
        [{ text: translate(languageCode, "bot.plan_management"), callback_data: "plan_management" }],
      ],
    },
  });
}

const sendError = (chatId: TelegramBot.ChatId, languageCode: string | undefined, error: any) => {
  console.log(error);
  getBot().sendMessage(chatId, translate(languageCode, "bot.error"));
};

const ADD_USER_KEYBOARD = (languageCode: string | undefined) =>
  ({
    inline_keyboard: [
      [
        {
          text: translate(languageCode, "bot.group.adduser"),
          callback_data: "adduser",
        },
      ],
    ],
  } as TelegramBot.InlineKeyboardMarkup);

export const OPEN_PRIVATE_KEYBOARD = (languageCode: string | undefined) =>
  ({
    inline_keyboard: [
      [
        {
          text: translate(languageCode, "bot.private_chat"),
          callback_data: "openbot",
        },
        {
          text: translate(languageCode, "bot.split"),
          callback_data: "split",
        },
      ],
      [
        {
          text: translate(languageCode, "bot.add_receipt"),
          callback_data: "receipt",
        },
      ],
    ],
  } as TelegramBot.InlineKeyboardMarkup);

// Add plan management button to private keyboard
const PRIVATE_KEYBOARD = (languageCode: string) => ({
  inline_keyboard: [
    [
      {
        text: translate(languageCode, "bot.list_transactions"),
        callback_data: "list_transactions",
      },
    ],
    [
      {
        text: translate(languageCode, "bot.add_split"),
        callback_data: "add_split",
      },
      {
        text: translate(languageCode, "bot.add_payment"),
        callback_data: "add_payment",
      },
    ],
    [
      {
        text: translate(languageCode, "bot.plan_management"),
        callback_data: "plan_management",
      },
    ],
  ],
});

// Add helper function to check premium access
async function checkPremiumAndNotify(userId: number, chatId: number, languageCode: string | undefined): Promise<boolean> {
  const { hasPlan } = await checkUserPlan(userId);
  if (!hasPlan) {
    await bot.sendMessage(
      chatId,
      translate(languageCode, "bot.premium_required"),
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{
              text: translate(languageCode, "bot.get_premium"),
              url: `https://chopchopsplit.com/#pricing?user_id=${userId}`
            }]
          ]
        }
      }
    );
    return false;
  }
  return true;
}

// Update start command handler
bot.onText(/\/start|\/setup|\/app/, async (message) => {
  const languageCode = message.from?.language_code;
  const userId = message.from?.id;

  if (!userId) return;
  if (message.chat.type === "channel") return;

  // Allow /start in private chat
  if (message.chat.type === "private") {
    sendPrivateMessage(message.chat.id, languageCode);
    return;
  }

  // Allow /start in groups too
  try {
    await registerGroup(message.chat);
    const members = (await groupMembers(message.chat)) || [];

    // Check if bot is admin
    const botUser = await bot.getMe();
    const botMember = await bot.getChatMember(message.chat.id, botUser.id);
    const isAdmin = botMember.status === 'administrator';

    const messageText = isAdmin 
      ? translate(languageCode, "bot.group.registered")
      : translate(languageCode, "bot.group.needs_admin");

    return bot.sendMessage(
      message.chat.id,
      messageText,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: translate(languageCode, isAdmin ? "bot.group.adduser" : "bot.group.make_admin"),
              url: isAdmin ? undefined : "https://t.me/ChopChopSplitBot?startgroup=admin",
              callback_data: isAdmin ? "adduser" : undefined
            }]
          ]
        }
      }
    );
  } catch (error) {
    sendError(message.chat.id, languageCode, error);
  }
});

// Update callback query handler
bot.on("callback_query", async (callbackQuery) => {
  const message = callbackQuery.message;
  if (!message) return;
  
  const languageCode = callbackQuery.from.language_code;
  const data = callbackQuery.data;

  try {
    if (data) {
      if (data === 'plan_management') {
        console.log("Checking plan details for user:", callbackQuery.from.id);
        const { hasPlan, plan } = await checkUserPlan(callbackQuery.from.id);
        
        if (!hasPlan || !plan) {
          await bot.sendMessage(
            message.chat.id,
            translate(languageCode, "bot.no_active_plan"),
            {
              parse_mode: "MarkdownV2",
              reply_markup: {
                inline_keyboard: [[{
                  text: translate(languageCode, "bot.get_premium"),
                  url: `https://chopchopsplit.com/#pricing?user_id=${callbackQuery.from.id}`
                }]]
              }
            }
          );
          return;
        }

        console.log("Getting plan limits for user:", callbackQuery.from.id);
        const limits = await getUserPlanLimits(callbackQuery.from.id);
        
        // Helper function to escape special characters for MarkdownV2
        const escapeMarkdown = (text: string) => {
          return text
            // Escape all special characters except asterisks used for bold
            .replace(/([_[\]()~`>#+=|{}.!-])/g, '\\$1');
        };

        // Format dates
        const startDate = plan.started_at.toLocaleDateString();
        const endDate = plan.expires_at.toLocaleDateString();
        const planType = plan.type.charAt(0).toUpperCase() + plan.type.slice(1);
        
        // Create message with actual values instead of templates
        const planMessage = [
          `Your current plan: *${planType} Plan*`,
          "",
          `Started: ${startDate}`,
          `Expires: ${endDate}`,
          "",
          "Remaining limits:",
          `- Travelers: ${Math.max(0, limits?.travelersRemaining || 0)}`,
          `- Receipt scans: ${Math.max(0, limits?.scansRemaining || 0)}`,
          `- Days: ${Math.max(0, limits?.daysRemaining || 0)}`,
          `- Trips: ${Math.max(0, limits?.tripsRemaining || 0)}`
        ].join("\n");

        await bot.sendMessage(
          message.chat.id,
          escapeMarkdown(planMessage),
          {
            parse_mode: "MarkdownV2",
            reply_markup: {
              inline_keyboard: [[{
                text: translate(languageCode, "bot.get_premium"),
                url: `https://chopchopsplit.com/#pricing?user_id=${callbackQuery.from.id}`
              }]]
            }
          }
        );
      } else if (data.startsWith('share_plan:')) {
        const childId = parseInt(data.split(':')[1]);
        const parentId = callbackQuery.from.id;
        
        try {
          const success = await addChildrenToPlan(parentId, [childId]);
          if (success) {
            await bot.sendMessage(
              message.chat.id,
              translate(languageCode, "bot.plan_shared_success", {
                user: (await bot.getChatMember(message.chat.id, childId)).user.first_name
              }),
              { parse_mode: "MarkdownV2" }
            );
          } else {
            await bot.sendMessage(
              message.chat.id,
              translate(languageCode, "bot.plan_shared_error"),
              { parse_mode: "MarkdownV2" }
            );
          }
        } catch (error) {
          console.error("Error sharing plan:", error);
          sendError(message.chat.id, languageCode, error);
        }
      }
    }
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error("Error handling callback query:", error);
    sendError(message.chat.id, languageCode, error);
  }
});

async function registerUser(user: TelegramBot.User, message: TelegramBot.Message) {
  const languageCode = user.language_code;

  try {
    await registerUserInGroup(user, message.chat);
    const members = (await groupMembers(message.chat)) || [];

    // Get group invite link
    let groupLink;
    try {
      const inviteLink = await bot.exportChatInviteLink(message.chat.id);
      groupLink = `[*${pmd2(message.chat.title || "the group")}*](${inviteLink})`;
    } catch (error) {
      // Fallback if we can't get invite link
      groupLink = `*${pmd2(message.chat.title || "the group")}*`;
    }

    // Send feedback to the user who joined
    await bot.sendMessage(
      user.id,
      translate(languageCode, "bot.group.joined", {
        groupLink
      }),
      { parse_mode: "MarkdownV2" }
    );

    // Update the group message
    bot.editMessageText(
      translate(languageCode, "bot.group.registered", {
        members: members.map((m: TelegramBot.User) => memberToList(m)).join("\n"),
      }),
      {
        chat_id: message?.chat.id,
        message_id: message?.message_id,
        parse_mode: "MarkdownV2",
        reply_markup: ADD_USER_KEYBOARD(languageCode),
      }
    );

    // If user has a premium plan, update their usage stats
    const { hasPlan } = await checkUserPlan(user.id);
    if (hasPlan) {
      // Update usage stats for travelers
      await updateUsageStats(user.id, { travelers: 1 });

      // Check for plan expiration and send reminder if needed
      const { plan } = await checkUserPlan(user.id);
      if (plan) {
        const hoursUntilExpiry = Math.ceil((plan.expires_at.getTime() - new Date().getTime()) / (1000 * 60 * 60));
        if (hoursUntilExpiry <= 24 && hoursUntilExpiry > 0) {
          await sendExpirationMessage(bot, user.id, translate(languageCode, `bot.plan_type.${plan.type}`));
        }
      }
    }
  } catch (error) {
    sendError(message.chat.id, languageCode, error);
  }
}

async function sendSplitExpenses(user: TelegramBot.User | undefined, message: TelegramBot.Message) {
  const languageCode = user?.language_code;

  try {
    const group = await getGroupById(message.chat.id);
    const graph = (await simplifyTransactions(group)) || [];

    let sendMessage = "";

    if (graph.length <= 0) {
      sendMessage = translate(languageCode, "bot.group.is_pair");
      return bot.sendMessage(message.chat.id, sendMessage, {
        parse_mode: "MarkdownV2",
        reply_markup: OPEN_PRIVATE_KEYBOARD(languageCode),
      });
    }

    sendMessage = "DEBTS LIST:\n";

    graph.forEach((g) => {
      sendMessage += `\n🧙‍♂️ ${formatUser(g)}\n`;

      g.debts.forEach((d) => {
        if (d.amount === 0) return (sendMessage += "  ↳ " + translate(languageCode, "bot.is_pair") + "\n");

        sendMessage += `  ↳ ` + pmd2(`RM` + Math.abs(d.amount).toFixed(2));
        sendMessage += d.amount > 0 ? " is owed to " : " is owed from ";
        sendMessage += `${formatUser(d)}\n`;
      });
    });

    return bot.sendMessage(message.chat.id, sendMessage, {
      parse_mode: "MarkdownV2",
      reply_markup: OPEN_PRIVATE_KEYBOARD(languageCode),
    });
  } catch (error) {
    sendError(message.chat.id, languageCode, error);
  }
}

// Update command handler to use /chop
bot.onText(/\/chop/, async (message) => {
  const userId = message.from?.id;
  if (!userId) return;

  if (!await checkPremiumAndNotify(userId, message.chat.id, message.from?.language_code)) {
    return;
  }

  sendSplitExpenses(message.from, message);
});

// Update receipt command handler
bot.onText(/\/receipt/, async (message) => {
  console.log("Receipt command received", {
    messageId: message.message_id,
    chatId: message.chat.id,
    chatType: message.chat.type,
    userId: message.from?.id,
    awaitingReceiptSize: state.awaitingReceipt.size,
    awaitingReceiptUsers: Array.from(state.awaitingReceipt)
  });
  
  if (!message.from?.id) {
    console.log("No user ID found");
    return;
  }

  if (message.chat.type === "private") {
    console.log("Private chat detected, ignoring");
    return;
  }

  if (!await checkPremiumAndNotify(message.from.id, message.chat.id, message.from.language_code)) {
    console.log("User doesn't have premium access");
    return;
  }

  console.log(`Adding user ${message.from.id} to awaiting receipt set`);
  state.awaitingReceipt.add(message.from.id);
  console.log("Updated awaiting receipt set:", Array.from(state.awaitingReceipt));
  
  await bot.sendMessage(
    message.chat.id,
    translate(message.from.language_code, "bot.send_receipt_photo"),
    { parse_mode: "MarkdownV2" }
  );
});

bot.on("photo", async (message) => {
  console.log("Photo received", {
    messageId: message.message_id,
    chatId: message.chat.id,
    chatType: message.chat.type,
    userId: message.from?.id,
    awaitingReceiptSize: state.awaitingReceipt.size,
    awaitingReceiptUsers: Array.from(state.awaitingReceipt),
    hasPhoto: !!message.photo,
    photoSizes: message.photo?.length
  });

  if (!message.from?.id) {
    console.log("No user ID in photo message");
    return;
  }

  if (!state.awaitingReceipt.has(message.from.id)) {
    console.log("User not awaiting receipt. Current awaiting users:", Array.from(state.awaitingReceipt));
    return;
  }

  console.log("User found in awaiting receipt set, proceeding with processing");
  state.awaitingReceipt.delete(message.from.id);
  console.log("Updated awaiting receipt set after removal:", Array.from(state.awaitingReceipt));

  // Check premium access for receipt scanning
  const hasAccess = await checkPremiumAccess(message.from.id, 'scan');
  if (!hasAccess) {
    console.log("User doesn't have premium access for scanning");
    await bot.sendMessage(
      message.chat.id,
      translate(message.from.language_code, "bot.premium_required"),
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{
              text: translate(message.from.language_code, "bot.get_premium"),
              url: `https://chopchopsplit.com/#pricing?user_id=${message.from.id}`
            }]
          ]
        }
      }
    );
    return;
  }

  console.log("Processing receipt for user");
  // state.awaitingReceipt.delete(message.from.id);

  if (!message.photo?.length) return;
  
  const languageCode = message.from?.language_code;
  
  console.log("1. Photo received, chat type:", message.chat.type);
  
  if (!message.photo || message.photo.length === 0) {
    console.log("No photo data found");
    return;
  }
  if (message.chat.type === "private") {
    console.log("Ignoring private chat photo");
    return;
  }
  
  try {
    // Get the largest photo size
    const photo = message.photo[message.photo.length - 1];
    console.log("2. Selected photo:", photo);
    
    // Get file path from Telegram
    const file = await bot.getFile(photo.file_id);
    console.log("3. Got file details:", file);
    if (!file.file_path) {
      throw new Error("Could not get file path");
    }

    // Send processing message
    console.log("4. Sending processing message");
    await bot.sendMessage(
      message.chat.id,
      translate(languageCode, "bot.receipt.processing"),
      { parse_mode: "MarkdownV2" }
    );

    // Download the file and process it
    console.log("5. Downloading file");
    const imageBuffer = await downloadTelegramFile(file.file_path);
    console.log("6. File downloaded, buffer size:", imageBuffer.length);
    
    console.log("7. Processing with Gemini");
    const result = await geminiProcessor.processImageBuffer(imageBuffer, {
      mimeType: "image/jpeg"
    });
    console.log("8. Gemini result:", result);

    if (result.error || !result.parsedData) {
      throw new Error(result.error || "Failed to parse receipt");
    }

    // Process items with tax before creating URL
    const receiptSummary = result.parsedData.summary;
    console.log("Raw Gemini response:", result.parsedData);
    console.log("Summary data:", receiptSummary);

    const total = Number(receiptSummary.total) || 0;
    const subtotal = Number(receiptSummary.subtotal) || 0;

    // If total equals subtotal, taxes are already included in prices
    const taxesIncluded = Math.abs(total - subtotal) < 0.01;

    const serviceCharge = taxesIncluded ? 0 : Number(receiptSummary.serviceCharge) || 0;
    const serviceTax = taxesIncluded ? 0 : Number(receiptSummary.serviceTax) || 0;
    const totalCharges = serviceCharge + serviceTax;

    console.log("Charges:", {
        serviceCharge,
        serviceTax,
        totalCharges
    });

    const processedItems = result.parsedData.items.map(item => {
      // Only calculate charges if taxes are not already included
      const itemCharges = taxesIncluded ? 0 : 
        totalCharges * (Number(item.totalPrice) / Number(receiptSummary.subtotal));
      const itemTotal = Number(item.totalPrice) + itemCharges;
      
      console.log(`${item.name}: Original=${item.totalPrice}, Charges=${itemCharges.toFixed(2)}, Total=${itemTotal.toFixed(2)}`);
      
      return {
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: itemTotal,
        originalPrice: Number(item.totalPrice),
        charges: itemCharges,
        assignedTo: []
      };
    });

    // Helper function to escape all special characters
    const escapeMarkdown = (text: string) => 
      text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

    // Format the receipt items for display
    const items = result.parsedData.items.map(item => 
      `${escapeMarkdown(item.name)}: ${item.quantity}x ${pmd2(item.unitPrice)} \\= ${pmd2(item.totalPrice)}`
    ).join("\n");

    const summary = `
Subtotal: ${pmd2(result.parsedData.summary.subtotal)}
Service Charge: ${pmd2(serviceCharge.toFixed(2))}
Service Tax: ${pmd2(serviceTax.toFixed(2))}
Total: ${pmd2(result.parsedData.summary.total)}
Store: ${escapeMarkdown(result.parsedData.metadata.storeName)}
Date: ${escapeMarkdown(result.parsedData.metadata.date)}`;

    // Send the parsed receipt data back to user
    await bot.sendMessage(
      message.chat.id,
      translate(languageCode, "bot.receipt.parsed", { 
        items: items.trim(),
        summary: summary.trim()
      }),
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: translate(languageCode, "bot.receipt.split"),
                callback_data: `split_receipt:${Date.now()}`
              },
              {
                text: translate(languageCode, "bot.private_chat"),
                callback_data: "openbot"
              }
            ]
          ]
        }
      }
    );

    // Update usage stats after successful scan
    await updateUsageStats(message.from.id, { scans: 1 });

    // Check for plan expiration and send reminder if needed
    const { plan } = await checkUserPlan(message.from.id);
    if (plan) {
      const hoursUntilExpiry = Math.ceil((plan.expires_at.getTime() - new Date().getTime()) / (1000 * 60 * 60));
      if (hoursUntilExpiry <= 24 && hoursUntilExpiry > 0) {
        await sendExpirationMessage(bot, message.from.id, translate(languageCode, `bot.plan_type.${plan.type}`));
      }
    }
  } catch (error) {
    console.error("Error processing receipt:", error);
    sendError(message.chat.id, languageCode, error);
  }
});

// Add trial command
bot.onText(/\/trial/, async (message) => {
  const languageCode = message.from?.language_code;
  const chatId = message.chat.id;

  if (message.chat.type !== "private") {
    await bot.sendMessage(
      chatId,
      translate(languageCode, "bot.trial_private_only"),
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  const trialUrl = `https://chopchopsplit.com/#pricing?user_id=${chatId}`;
  await bot.sendMessage(
    chatId,
    translate(languageCode, "bot.start_trial_message"),
    {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [{ text: translate(languageCode, "bot.start_trial"), url: trialUrl }]
        ]
      }
    }
  );
});

// Update help command handler
bot.onText(/\/help/, async (message) => {
  const userId = message.from?.id;
  if (!userId) return;

  const helpMessage = translate(message.from?.language_code, "bot.help_message");
  await bot.sendMessage(message.chat.id, helpMessage, { parse_mode: "MarkdownV2" });
});

// Add plan management handler
async function sendPlanDetails(chatId: number, languageCode: string | undefined) {
  try {
    console.log("Fetching plan details for user:", chatId);
    const { hasPlan, plan } = await checkUserPlan(chatId);
    
    if (!hasPlan || !plan) {
      console.log("No active plan found");
      await bot.sendMessage(
        chatId,
        translate(languageCode, "bot.no_plan"),
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [{
                text: translate(languageCode, "bot.get_plan"),
                url: `https://chopchopsplit.com/#pricing?user_id=${chatId}`
              }]
            ]
          }
        }
      );
      return;
    }

    console.log("Getting plan limits");
    const limits = await getUserPlanLimits(chatId);
    if (!limits) {
      console.log("Failed to get plan limits");
      throw new Error("Failed to get plan limits");
    }

    const planLimits = PLAN_LIMITS[plan.type];
    const planFeatures = translate(languageCode, `bot.plan_features.${plan.type}`);
    const planType = translate(languageCode, `bot.plan_type.${plan.type}`);

    // Format dates with proper timezone
    const startDate = plan.started_at.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const expiryDate = plan.expires_at.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    console.log("Preparing plan details message");
    const planDetails = translate(languageCode, "bot.plan_details", {
      planType: planType,
      startDate: startDate,
      expiryDate: expiryDate,
      features: planFeatures,
      scansUsed: (planLimits.maxScans - limits.scansRemaining).toString(),
      scansTotal: planLimits.maxScans === Infinity ? "∞" : planLimits.maxScans.toString(),
      tripsUsed: (planLimits.maxTrips - limits.tripsRemaining).toString(),
      tripsTotal: planLimits.maxTrips.toString(),
      travelersUsed: (planLimits.maxTravelers - limits.travelersRemaining).toString(),
      travelersTotal: planLimits.maxTravelers.toString()
    });

    console.log("Sending plan details message");
    await bot.sendMessage(
      chatId,
      planDetails,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{
              text: translate(languageCode, "bot.get_plan"),
              url: `https://chopchopsplit.com/#pricing?user_id=${chatId}`
            }]
          ]
        }
      }
    );
  } catch (error) {
    console.error("Error in sendPlanDetails:", error);
    sendError(chatId, languageCode, error);
  }
}

// Add ping function
async function pingServer() {
  try {
    const response = await fetch(getBaseHost());
    console.log("Server ping status:", response.status);
  } catch (error) {
    console.error("Ping failed:", error);
  }
}

// Add self-ping initialization
function initializePing() {
  // Ping every 14 minutes (840000 ms)
  // We use 14 minutes to be safe before Render's 15-minute timeout
  setInterval(pingServer, 840000);
  console.log("Self-ping initialized");
}

// Add new command handlers for managing plan access
bot.onText(/\/share/, async (message) => {
  const userId = message.from?.id;
  const languageCode = message.from?.language_code;
  
  if (!userId) return;

  // Check if user has their own plan (not a child plan)
  const { hasPlan, plan, isChild } = await checkUserPlan(userId);
  if (!hasPlan || !plan || isChild) {
    await bot.sendMessage(
      message.chat.id,
      translate(languageCode, "bot.premium_required"),
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{
              text: translate(languageCode, "bot.get_premium"),
              url: `https://chopchopsplit.com/#pricing?user_id=${userId}`
            }]
          ]
        }
      }
    );
    return;
  }

  // Get group members
  const group = await getGroupById(message.chat.id);
  if (!group) return;

  // Create keyboard with all group members except the plan owner
  const keyboard = group.members
    .filter(member => member.id !== userId && !plan.children?.includes(member.id))
    .map(member => [{
      text: `${member.first_name} ${member.last_name || ''}`,
      callback_data: `share_plan:${member.id}`
    }]);

  if (keyboard.length === 0) {
    await bot.sendMessage(
      message.chat.id,
      translate(languageCode, "bot.no_members_to_share"),
      { parse_mode: "MarkdownV2" }
    );
    return;
  }

  await bot.sendMessage(
    message.chat.id,
    translate(languageCode, "bot.select_members_to_share"),
    {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: keyboard
      }
    }
  );
});
