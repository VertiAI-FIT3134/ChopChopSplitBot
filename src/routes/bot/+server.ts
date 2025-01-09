import { bot, setWebhook } from "$lib/bot/bot";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const update = await request.json();
    console.log("Received update:", update);
    await bot.processUpdate(update);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("Error processing update:", e);
    return new Response("Error", { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url }) => {
  const set = Number(url.searchParams.get("set") ?? "0");

  if (set <= 0) return new Response("", { status: 404 });

  return Response.json(await setWebhook());
};
