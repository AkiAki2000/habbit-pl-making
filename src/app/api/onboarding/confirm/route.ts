import { OnboardingProposalSchema } from "@/lib/onboarding";
import { confirmOnboardingProposal } from "@/lib/db-queries";

/**
 * The only place onboarding output is written into segments/accounts/
 * weight_rules — called solely by the user's explicit "この内容で保存する"
 * action, never automatically from the chat turn itself. Re-validates the
 * proposal server-side (the user may have edited it in the review UI, so
 * client-side validation alone isn't sufficient).
 */
export async function POST(request: Request) {
  let sessionId: string;
  let proposalRaw: unknown;
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      proposal?: unknown;
    };
    if (!body.sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }
    sessionId = body.sessionId;
    proposalRaw = body.proposal;
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const parsed = OnboardingProposalSchema.safeParse(proposalRaw);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "保存内容の形式が正しくありません: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
      { status: 400 },
    );
  }

  try {
    await confirmOnboardingProposal(sessionId, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("onboarding confirm error", error);
    return Response.json(
      { error: "保存中にエラーが発生しました。時間を置いて再度お試しください。" },
      { status: 502 },
    );
  }
}
