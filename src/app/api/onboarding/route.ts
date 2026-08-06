import Anthropic from "@anthropic-ai/sdk";
import { ONBOARDING_SYSTEM_PROMPT, type ChatMessage } from "@/lib/onboarding";

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
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }
    messages = body.messages;
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
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

    if (response.stop_reason === "refusal") {
      return Response.json(
        {
          error:
            "その内容には対応できませんでした。別の言い方で教えていただけますか？",
        },
        { status: 200 },
      );
    }

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return Response.json({ reply });
  } catch (error) {
    console.error("onboarding API error", error);
    return Response.json(
      { error: "APIの呼び出し中にエラーが発生しました。時間を置いて再度お試しください。" },
      { status: 502 },
    );
  }
}
