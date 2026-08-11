import { z } from "zod";
import { recordEntry } from "@/lib/db-queries";

const RecordEntrySchema = z.object({
  habitId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evaluation: z.enum(["achieved", "notApplicable", "notAchieved"]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const parsed = RecordEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  try {
    const record = await recordEntry(
      parsed.data.habitId,
      parsed.data.date,
      parsed.data.evaluation,
    );
    return Response.json({ record });
  } catch (error) {
    console.error("entry record error", error);
    return Response.json(
      { error: "記録の保存中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
