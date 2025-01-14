import { getAnalytics } from "$lib/db/analytics";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  try {
    const analytics = await getAnalytics();
    return Response.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}; 