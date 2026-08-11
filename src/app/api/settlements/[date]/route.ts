import { unconfirmDate } from "@/lib/db-queries";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  try {
    await unconfirmDate(date);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("settlement delete error", error);
    return Response.json(
      { error: "確定解除中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
