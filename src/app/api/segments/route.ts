import { createSegment } from "@/lib/db-queries";

export async function POST(request: Request) {
  let name: string;
  try {
    const body = (await request.json()) as { name?: string };
    if (!body.name || !body.name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    name = body.name.trim();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  try {
    await createSegment(name);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("segment create error", error);
    return Response.json(
      { error: "セグメントの作成中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
