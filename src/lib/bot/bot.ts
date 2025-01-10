import { env } from "$env/dynamic/private";
import TelegramBot from "node-telegram-bot-api";
import { translate } from "../i18n/i18n";
import { getGroupById, groupMembers, registerGroup, registerUserInGroup, simplifyTransactions } from "../db/interface";
import { formatUser, memberToList, pmd2 } from "./utils";
import { GeminiImageProcessor } from "../../../services/gemini-processor";
import { downloadTelegramFile } from "../utils/telegram-utils";

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
  }
  return botInstance;
}

// Initialize Gemini processor
const geminiProcessor = new GeminiImageProcessor();

// Add at the top with other state variables
const awaitingReceipt = new Set<number>();

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
  getBot().sendMessage(chatId, translate(languageCode, "bot.add_to_group"), {
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [
        [{ text: translate(languageCode, "bot.list_transactions"), web_app: { url: getBaseHost() + "/webapp/list" } }],
        [{ text: translate(languageCode, "bot.add_split"), web_app: { url: getBaseHost() + "/webapp/add-split" } }],
        [{ text: translate(languageCode, "bot.add_payment"), web_app: { url: getBaseHost() + "/webapp/add-payment" } }],
        [{ text: translate(languageCode, "bot.start_trial"), url: `https://chopchopsplit.com/#pricing?user_id=${chatId}` }],
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
    ],
  } as TelegramBot.InlineKeyboardMarkup);

bot.onText(/\/start|\/setup|\/app/, async (message) => {
  const languageCode = message.from?.language_code;

  if (message.chat.type === "channel") return;

  if (message.chat.type === "private") {
    sendPrivateMessage(message.chat.id, languageCode);
    return;
  }

  try {
    await registerGroup(message.chat);
    const members = (await groupMembers(message.chat)) || [];

    return bot.sendMessage(
      message.chat.id,
      translate(languageCode, "bot.group.registered", {
        members: members.map((m: TelegramBot.User) => memberToList(m)).join("\n"),
      }),
      {
        parse_mode: "MarkdownV2",
        reply_markup: ADD_USER_KEYBOARD(languageCode),
      }
    );
  } catch (error) {
    sendError(message.chat.id, languageCode, error);
  }
});

bot.on("callback_query", async (query) => {
  if (!query.message) return;

  console.log("Callback received:", query.data);

  if (query.data === "adduser") {
    registerUser(query.from, query.message);
  } else if (query.data === "openbot") {
    sendPrivateMessage(query.from.id, query.from.language_code);
  } else if (query.data === "split") {
    sendSplitExpenses(query.from, query.message);
  } else if (query.data?.startsWith('split_receipt:')) {
    console.log("Processing split receipt callback");
    const messageText = query.message.text;
    console.log("Message text:", messageText);
    
    if (!messageText) {
      console.log("No message text found");
      return;
    }

    try {
      // Parse total amount from the message
      const totalMatch = messageText.match(/Total: ([\d.]+)/);
      if (!totalMatch) throw new Error("Could not find total amount");
      
      const amount = parseFloat(totalMatch[1]);
      
      // Get store name and date
      const storeMatch = messageText.match(/Store: (.+)\n/);
      const dateMatch = messageText.match(/Date: (.+)/);
      
      const description = `Receipt from ${storeMatch?.[1] || 'store'} on ${dateMatch?.[1] || 'unknown date'}`;

      // Parse items from the message text
      const items = messageText
        .split('\n')
        .filter(line => line.includes(': ') && line.includes(' = '))
        .map(line => {
          const [name, details] = line.split(': ');
          const [quantity, unitPrice, , totalPrice] = details.split(' ').map(n => parseFloat(n) || 0);
          return {
            name,
            quantity,
            unitPrice,
            totalPrice,
            assignedTo: []
          };
        });

      console.log("Message Text:", messageText);

      // Update regex patterns to match the exact format
      const serviceChargeMatch = messageText.match(/Service Charge: ([\d.]+)/);
      const serviceTaxMatch = messageText.match(/Service Tax: ([\d.]+)/);

      console.log("Service Charge Match:", serviceChargeMatch);
      console.log("Service Tax Match:", serviceTaxMatch);

      const serviceCharge = parseFloat(serviceChargeMatch?.[1] || '0');
      const serviceTax = parseFloat(serviceTaxMatch?.[1] || '0');

      // Add this to parse taxesIncluded from message
      const total = parseFloat(totalMatch[1]);
      const subtotalMatch = messageText.match(/Subtotal: ([\d.]+)/);
      const subtotal = parseFloat(subtotalMatch?.[1] || '0');
      const taxesIncluded = Math.abs(total - subtotal) < 0.01;

      // Create URL with processed items and tax information
      const webAppUrl = `${getBaseHost()}/webapp/add-split?amount=${amount}&description=${encodeURIComponent(description)}&receiptItems=${encodeURIComponent(JSON.stringify(items))}&serviceCharge=${serviceCharge}&serviceTax=${serviceTax}&taxesIncluded=${taxesIncluded}`;

      console.log("Web app URL:", webAppUrl);

      // Send web app button in private chat
      await bot.sendMessage(
        query.from.id,
        `Receipt Details\\:\nAmount: RM${pmd2(amount.toFixed(2))} \n${pmd2(description)}`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[{
              text: translate(query.from.language_code, "bot.add_split"),
              web_app: { url: webAppUrl }
            }]]
          }
        }
      );

      // Answer the callback query
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error("Error processing split receipt:", error);
      sendError(query.message.chat.id, query.from.language_code, error);
      await bot.answerCallbackQuery(query.id, { text: "Error processing receipt" });
    }
  }
});

async function registerUser(user: TelegramBot.User, message: TelegramBot.Message) {
  const languageCode = user.language_code;

  try {
    await registerUserInGroup(user, message.chat);
    const members = (await groupMembers(message.chat)) || [];

    // Create a clickable group link
    const groupLink = `[*${pmd2(message.chat.title || "the group")}*](https://t.me/c/${message.chat.id.toString().slice(4)})`;

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

bot.onText(/\/split/, async (message) => {
  sendSplitExpenses(message.from, message);
});

// Add the receipt command handler
bot.onText(/\/receipt/, async (message) => {
  console.log("Receipt command received");
  
  if (!message.from?.id) {
    console.log("No user ID found");
    return;
  }

  if (message.chat.type === "private") {
    console.log("Private chat detected");
    return;
  }

  console.log(`Adding user ${message.from.id} to awaiting receipt`);
  awaitingReceipt.add(message.from.id);
  
  await bot.sendMessage(
    message.chat.id,
    "Please send a photo of your receipt",
    { parse_mode: "MarkdownV2" }
  );
});

bot.on("photo", async (message) => {
  console.log("Photo received");
  console.log("From user:", message.from?.id);
  console.log("Awaiting receipt users:", Array.from(awaitingReceipt));

  if (!message.from?.id) {
    console.log("No user ID in photo message");
    return;
  }

  if (!awaitingReceipt.has(message.from.id)) {
    console.log("User not awaiting receipt");
    return;
  }

  console.log("Processing receipt for user");
  awaitingReceipt.delete(message.from.id);

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
