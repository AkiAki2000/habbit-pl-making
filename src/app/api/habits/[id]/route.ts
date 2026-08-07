import { z } from "zod";
import { deleteHabit, updateHabit } from "@/lib/db-queries";

const UpdateHabitSchema = z.object({
  name: z.string().min(1).optional(),
  segment: z.string().min(1).optional(),
  amounts: z
    .object({
      achieved: z.number(),
      notApplicable: z.number(),
      notAchieved: z.number(),
    })
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const parsed = UpdateHabitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  try {
    await updateHabit(id, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("habit update error", error);
    return Response.json(
      { error: "科目の更新中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteHabit(id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("habit delete error", error);
    return Response.json(
      { error: "科目の削除中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
