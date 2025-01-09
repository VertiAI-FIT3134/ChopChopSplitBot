// See https://kit.svelte.dev/docs/types#app

import type TelegramBot from "node-telegram-bot-api";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface Platform {}
  }

  interface Window {
    Telegram: {
      WebView: unknown;
      Utils: unknown;
      WebApp: Record<string, unknown>;
    };
  }

  interface Group extends TelegramBot.Chat {
    members: TelegramBot.User[];
    splits?: TransactionData[];
    payments?: TransactionData[];
  }
  interface UserData {
    user: TelegramBot.User;
    groups: Group[];
  }

  interface PaymentInformation {
    description: string;
    amount: number;
    from: TelegramBot.User;
    to?: TelegramBot.User;
    receiptItems?: ReceiptItem[];
    serviceCharge?: number;
    serviceTax?: number;
    id?: string;
    taxesIncluded?: boolean;
  }

  type SplitMode = "equally" | "unequally" | "percentages" | "shares";

  interface UserSplit extends TelegramBot.User {
    selected: boolean;
    amount: number | null;
    user?: number;
  }

  interface SplitInformation {
    mode: SplitMode;
    splits: UserSplit[];
  }

  interface TransactionData {
    _id?: string;
    group: TelegramBot.Chat;
    date: Date;
    description?: string;
    amount: number;
    from: TelegramBot.User;
    to?: TelegramBot.User;
    mode?: SplitMode;
    splits?: UserSplit[];
    receiptItems?: ReceiptItem[];
    serviceCharge?: number;
    serviceTax?: number;
  }

  interface ReceiptItem {
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    assignedTo: number[];
    originalPrice?: number;
    charges?: number;  // for service charge + service tax
  }

  interface TransactionGraph {
    from: TelegramBot.User;
    to: TelegramBot.User;
    amount: number;
  }

  type Debt = TelegramBot.User & {
    amount: number;
  };

  interface GraphData extends TelegramBot.User {
    debts: Debt[];
  }


  // interface ReceiptItem {
  //   name: string;
  //   quantity: number;
  //   unitPrice: number;
  //   totalPrice: number;
  //   assignedTo: number[];
  // }
}

export {};
