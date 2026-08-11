import { getFullState } from "@/lib/db-queries";

/** Returns the full app state needed to render the client (habits, records, confirmed dates, segments, start date). */
export async function GET() {
  try {
    const state = await getFullState();
    return Response.json(state);
  } catch (error) {
    console.error("state fetch error", error);
    return Response.json(
      { error: "データの取得中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
