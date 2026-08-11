import Anthropic from "@anthropic-ai/sdk";
import {
  ONBOARDING_SYSTEM_PROMPT,
  validateProposal,
  type ChatMessage,
} from "@/lib/onboarding";
import { saveOnboardingTurn } from "@/lib/db-queries";

// maxRetries gives transient network/5xx/429 failures automatic exponential
// backoff via the SDK itself, satisfying the "API呼び出し失敗時のリトライ" requirement
// without hand-rolled retry loops.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
});

async function callClaude(
  messages: ChatMessage[],
): Promise<{ reply: string; refused: boolean }> {
  const response = await client.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: ONBOARDING_SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  if (response.stop_reason === "refusal") return { reply: "", refused: true };

  const reply = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return { reply, refused: false };
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY が設定されていません。リポジトリの .env.local に ANTHROPIC_API_KEY=... を追加して、開発サーバーを再起動してください。",
      },
      { status: 500 },
    );
  }

  let messages: ChatMessage[];
  let sessionId: string | null;
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      sessionId?: string;
    };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }
    messages = body.messages;
    sessionId = body.sessionId ?? null;
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  try {
    const first = await callClaude(messages);
    if (first.refused) {
      return Response.json(
        { error: "その内容には対応できませんでした。別の言い方で教えていただけますか？" },
        { status: 200 },
      );
    }

    // If a habit-pl-json block is present but malformed, ask the model to
    // fix that specific error once, entirely behind the scenes — the user
    // never sees the broken attempt, only whichever reply ends up valid (or
    // the original prose, if the repair pass itself doesn't pan out).
    let reply = first.reply;
    const validation = validateProposal(reply);
    if (validation.error) {
      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: reply },
        {
          role: "user",
          content: `(システムからの自動チェック) 直前のJSON出力に次のエラーがありました: ${validation.error}\n同じ内容の要約文に続けて、エラーを修正した正しいJSON形式で habit-pl-json コードブロックを出力し直してください。`,
        },
      ];
      const repaired = await callClaude(repairMessages);
      if (!repaired.refused && repaired.reply) {
        reply = repaired.reply;
      }
    }

    const finalValidation = validateProposal(reply);
    const updatedMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: reply },
    ];
    const savedSessionId = await saveOnboardingTurn(
      sessionId,
      updatedMessages,
      finalValidation.proposal,
    );

    return Response.json({
      reply,
      sessionId: savedSessionId,
      proposal: finalValidation.proposal,
    });
  } catch (error) {
    console.error("onboarding API error", error);
    return Response.json(
      { error: "APIの呼び出し中にエラーが発生しました。時間を置いて再度お試しください。" },
      { status: 502 },
    );
  }
}
