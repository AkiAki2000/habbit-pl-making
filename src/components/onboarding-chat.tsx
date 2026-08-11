"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  stripProposalBlock,
  validateProposal,
  type ChatMessage,
  type OnboardingAccount,
  type OnboardingProposal,
} from "@/lib/onboarding";

const SEED_MESSAGE: ChatMessage = {
  role: "user",
  content: "オンボーディングを始めてください。",
};

interface ChatApiResponse {
  reply?: string;
  error?: string;
  sessionId?: string;
  proposal?: OnboardingProposal | null;
}

async function callOnboardingApi(
  messages: ChatMessage[],
  sessionId: string | null,
): Promise<ChatApiResponse> {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, sessionId }),
  });
  const body = (await res.json()) as ChatApiResponse;
  if (!res.ok || !body.reply) {
    throw new Error(body.error ?? "不明なエラーが発生しました。");
  }
  return body;
}

// A stable per-row key independent of `name`, so renaming a habit in the
// review UI doesn't lose track of which account/weight_rule pair it belongs
// to (accounts are matched to weight_rules by name, which is exactly the
// field this UI lets the user edit).
interface DraftRow {
  key: string;
  segment_name: string;
  name: string;
  type: OnboardingAccount["type"];
  frequency: OnboardingAccount["frequency"];
  criteria_achieved: string;
  criteria_missed: string;
  criteria_badly_missed: string;
  amount_achieved: number;
  amount_missed: number;
  amount_badly_missed: number;
}

function proposalToDraftRows(proposal: OnboardingProposal): DraftRow[] {
  const ruleByAccount = new Map(proposal.weight_rules.map((r) => [r.account_name, r]));
  return proposal.accounts.map((account, i) => {
    const rule = ruleByAccount.get(account.name);
    return {
      key: `${i}-${account.name}`,
      segment_name: account.segment_name,
      name: account.name,
      type: account.type,
      frequency: account.frequency,
      criteria_achieved: account.criteria_achieved,
      criteria_missed: account.criteria_missed,
      criteria_badly_missed: account.criteria_badly_missed,
      amount_achieved: rule?.amount_achieved ?? 100,
      amount_missed: rule?.amount_missed ?? 0,
      amount_badly_missed: rule?.amount_badly_missed ?? -100,
    };
  });
}

function draftRowsToProposal(rows: DraftRow[]): OnboardingProposal {
  const segmentNames = Array.from(new Set(rows.map((r) => r.segment_name)));
  return {
    segments: segmentNames.map((name) => ({ name })),
    accounts: rows.map((r) => ({
      segment_name: r.segment_name,
      name: r.name,
      type: r.type,
      frequency: r.frequency,
      criteria_achieved: r.criteria_achieved,
      criteria_missed: r.criteria_missed,
      criteria_badly_missed: r.criteria_badly_missed,
    })),
    weight_rules: rows.map((r) => ({
      account_name: r.name,
      amount_achieved: r.amount_achieved,
      amount_missed: r.amount_missed,
      amount_badly_missed: r.amount_badly_missed,
      change_reason: null,
    })),
  };
}

function ProposalReview({
  rows,
  onChange,
  onRemove,
}: {
  rows: DraftRow[];
  onChange: (key: string, updates: Partial<DraftRow>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-white p-3"
        >
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-semibold text-gray-900 focus:border-gray-500 focus:outline-none"
              value={row.name}
              onChange={(e) => onChange(row.key, { name: e.target.value })}
              aria-label="科目名"
            />
            <button
              type="button"
              onClick={() => onRemove(row.key)}
              className="shrink-0 rounded-md px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
            >
              削除
            </button>
          </div>
          <input
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
            value={row.segment_name}
            onChange={(e) => onChange(row.key, { segment_name: e.target.value })}
            aria-label="セグメント"
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">達成</span>
              <input
                type="number"
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                value={row.amount_achieved}
                onChange={(e) => onChange(row.key, { amount_achieved: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">該当なし</span>
              <input
                type="number"
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                value={row.amount_missed}
                onChange={(e) => onChange(row.key, { amount_missed: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">未達</span>
              <input
                type="number"
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                value={row.amount_badly_missed}
                onChange={(e) => onChange(row.key, { amount_badly_missed: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OnboardingChat() {
  const router = useRouter();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [draftRows, setDraftRows] = useState<DraftRow[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const startedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    fetch("/api/onboarding/session")
      .then((res) => res.json())
      .then(
        (body: {
          session?: { id: string; messages: ChatMessage[]; proposal: OnboardingProposal | null };
          error?: string;
        }) => {
          if (body.session) {
            setSessionId(body.session.id);
            setHistory(body.session.messages);
            if (body.session.proposal) {
              setDraftRows(proposalToDraftRows(body.session.proposal));
            }
            setResuming(false);
            return;
          }
          // No session to resume: start a brand-new conversation.
          setLoading(true);
          callOnboardingApi([SEED_MESSAGE], null)
            .then((res) => {
              setHistory([SEED_MESSAGE, { role: "assistant", content: res.reply! }]);
              setSessionId(res.sessionId ?? null);
              if (res.proposal) setDraftRows(proposalToDraftRows(res.proposal));
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => {
              setLoading(false);
              setResuming(false);
            });
        },
      )
      .catch(() => setResuming(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
      const res = await callOnboardingApi(next, sessionId);
      setHistory([...next, { role: "assistant", content: res.reply! }]);
      if (res.sessionId) setSessionId(res.sessionId);
      if (res.proposal) setDraftRows(proposalToDraftRows(res.proposal));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateDraftRow = (key: string, updates: Partial<DraftRow>) => {
    setDraftRows((prev) =>
      prev ? prev.map((r) => (r.key === key ? { ...r, ...updates } : r)) : prev,
    );
  };

  const removeDraftRow = (key: string) => {
    setDraftRows((prev) => (prev ? prev.filter((r) => r.key !== key) : prev));
  };

  const confirmProposal = async () => {
    if (!draftRows || draftRows.length === 0 || !sessionId) return;
    setSaving(true);
    setError(null);
    try {
      const proposal = draftRowsToProposal(draftRows);
      // Defense in depth: re-validate client-side too, since the review UI
      // just let the user hand-edit this — the server re-validates
      // independently regardless.
      const check = validateProposal("```habit-pl-json\n" + JSON.stringify(proposal) + "\n```");
      if (!check.proposal) {
        throw new Error(check.error ?? "入力内容に不備があります。");
      }
      const res = await fetch("/api/onboarding/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, proposal }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "保存に失敗しました。");
      }
      setSaved(true);
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col px-4 sm:py-6">
      <header className="flex shrink-0 flex-col gap-1 py-4 sm:py-0 sm:pb-4">
        <p className="text-sm font-medium text-gray-500">習慣PL — オンボーディング</p>
        <p className="text-xs text-gray-400">
          理想の状態から、記録する習慣を一緒に考えます。
        </p>
      </header>

      <div
        ref={scrollAreaRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4"
      >
        {resuming && (
          <p className="text-sm text-gray-400">これまでの続きを確認しています…</p>
        )}
        {history
          .filter(
            (m) =>
              !(m.role === SEED_MESSAGE.role && m.content === SEED_MESSAGE.content),
          )
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

      <div className="sticky bottom-0 flex shrink-0 flex-col gap-3 bg-gray-50 pt-3 pb-4 sm:pb-6">
        {draftRows && draftRows.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">
              この内容で保存しますか？（内容は下で編集できます）
            </p>
            <ProposalReview
              rows={draftRows}
              onChange={updateDraftRow}
              onRemove={removeDraftRow}
            />
            <button
              type="button"
              onClick={() => void confirmProposal()}
              disabled={saved || saving}
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {saved ? "保存しました" : saving ? "保存しています…" : "この内容で保存する"}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            placeholder="メッセージを入力"
            value={input}
            disabled={loading || resuming}
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
            disabled={loading || resuming || !input.trim()}
            className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
