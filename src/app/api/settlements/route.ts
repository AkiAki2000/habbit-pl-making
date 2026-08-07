import { confirmDate } from "@/lib/db-queries";

export async function POST(request: Request) {
  let date: string;
  try {
    const body = (await request.json()) as { date?: string };
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return Response.json({ error: "valid date is required" }, { status: 400 });
    }
    date = body.date;
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  try {
    await confirmDate(date);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("settlement create error", error);
    return Response.json(
      { error: "確定処理中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
