"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadState,
  saveHabits,
  saveSegments,
  type Segment,
} from "@/lib/habit-pl";
import {
  extractProposal,
  proposalToHabits,
  saveOnboardingExport,
  stripProposalBlock,
  type ChatMessage,
  type OnboardingProposal,
} from "@/lib/onboarding";

const SEED_MESSAGE: ChatMessage = {
  role: "user",
  content: "オンボーディングを始めてください。",
};

async function callOnboardingApi(messages: ChatMessage[]): Promise<string> {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const body = (await res.json()) as { reply?: string; error?: string };
  if (!res.ok || !body.reply) {
    throw new Error(body.error ?? "不明なエラーが発生しました。");
  }
  return body.reply;
}

export function OnboardingChat() {
  const router = useRouter();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState<OnboardingProposal | null>(null);
  const [saved, setSaved] = useState(false);
  const startedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoading(true);
    callOnboardingApi([SEED_MESSAGE])
      .then((reply) => {
        setHistory([SEED_MESSAGE, { role: "assistant", content: reply }]);
        setProposal(extractProposal(reply));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const next = [...history, { role: "user" as const, content: text }];
    setHistory(next);
    setLoading(true);
    try {
      const reply = await callOnboardingApi(next);
      setHistory([...next, { role: "assistant", content: reply }]);
      const nextProposal = extractProposal(reply);
      if (nextProposal) setProposal(nextProposal);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const confirmProposal = () => {
    if (!proposal) return;
    saveOnboardingExport(proposal);

    const stored = loadState();
    const newHabits = proposalToHabits(proposal);
    saveHabits([...stored.habits, ...newHabits]);

    const segmentNames = proposal.segments.map((s) => s.name);
    const mergedSegments: Segment[] = [...stored.segments];
    for (const name of [
      ...segmentNames,
      ...newHabits.map((h) => h.segment),
    ]) {
      if (!mergedSegments.includes(name)) mergedSegments.push(name);
    }
    saveSegments(mergedSegments);

    setSaved(true);
    router.push("/");
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-gray-500">習慣PL — オンボーディング</p>
        <p className="text-xs text-gray-400">
          理想の状態から、記録する習慣を一緒に考えます。
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
        {history
          .filter((m) => m !== SEED_MESSAGE)
          .map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <p
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {m.role === "assistant" ? stripProposalBlock(m.content) : m.content}
              </p>
            </div>
          ))}
        {loading && (
          <div className="flex justify-start">
            <p className="rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-400">
              考えています…
            </p>
          </div>
        )}
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {proposal && (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">
            この内容で保存しますか？
          </p>
          <ul className="flex flex-col gap-1 text-xs text-emerald-900">
            {proposal.segments.map((s) => (
              <li key={s.name}>
                <span className="font-semibold">{s.name}</span>:{" "}
                {proposal.accounts
                  .filter((a) => a.segment_name === s.name)
                  .map((a) => a.name)
                  .join("、") || "（科目なし）"}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={confirmProposal}
            disabled={saved}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saved ? "保存しました" : "この内容で保存する"}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          placeholder="メッセージを入力"
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          送信
        </button>
      </div>
    </div>
  );
}
