import { z } from "zod";
import { createHabit } from "@/lib/db-queries";

const CreateHabitSchema = z.object({
  name: z.string().min(1),
  segment: z.string().min(1),
  amounts: z.object({
    achieved: z.number(),
    notApplicable: z.number(),
    notAchieved: z.number(),
  }),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const parsed = CreateHabitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }

  try {
    const habit = await createHabit(parsed.data.name, parsed.data.segment, parsed.data.amounts);
    return Response.json({ habit });
  } catch (error) {
    console.error("habit create error", error);
    return Response.json(
      { error: "科目の作成中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
