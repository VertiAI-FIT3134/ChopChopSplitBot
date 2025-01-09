import { env } from "$env/dynamic/private";
import fetch from "node-fetch";

const BOT_TOKEN = env.BOT_TOKEN;

export async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const response = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
  
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
} 