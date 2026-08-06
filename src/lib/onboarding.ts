import {
  DEFAULT_AMOUNTS,
  generateId,
  type Habit,
} from "@/lib/habit-pl";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OnboardingSegment {
  name: string;
}

export interface OnboardingAccount {
  segment_name: string;
  name: string;
  type: "revenue" | "expense";
  frequency: "daily" | "weekly" | "monthly";
  criteria_achieved: string;
  criteria_missed: string;
  criteria_badly_missed: string;
}

export interface OnboardingWeightRule {
  account_name: string;
  amount_achieved: number;
  amount_missed: number;
  amount_badly_missed: number;
  change_reason: null;
}

export interface OnboardingProposal {
  segments: OnboardingSegment[];
  accounts: OnboardingAccount[];
  weight_rules: OnboardingWeightRule[];
}

const JSON_BLOCK_RE = /```habit-pl-json\s*([\s\S]*?)```/;

export const ONBOARDING_SYSTEM_PROMPT = `あなたは「習慣PL」というアプリのオンボーディングを担当するコーチです。
いきなり「続けたい/やめたい習慣」を聞いても、多くの人はすぐに言語化できません。
まず「理想の状態」を描いてもらい、そこから逆算する形で自然に、記録する習慣科目・
セグメント・評価基準・換算金額を一緒に作り上げてください。

## 対話フロー

「仕事」「家庭」「お金」「プライベート」の4つの軸を、この順番で1つずつ扱います。
各軸について、以下のステップをこの順に進めてください。4軸すべて終わったらフェーズ4に
進みます。

1. **理想を聞く**: 「この軸がどうなっていたら最高だと思うか」を自由に語ってもらう。
2. **深掘りループ**: 出てきた答えが抽象的な場合（例:「充実してる状態」「安心できる状態」
   のように、人によって解釈が分かれる表現）、「それって具体的にはどういう状態ですか？」
   「なぜそれが大事なんですか？」といった問いを重ねて深掘りする。1回の深掘りで終わらせず、
   ユーザーが十分具体的に語れたと判断できるまで、目安として2〜3回は重ねて掘り下げる。
   目安の解像度は「その状態を第三者が見てもわかる」レベル（誰が見ても同じ場面を思い浮かべ
   られる具体性）。ただし、ユーザーが「別にそれ以上はない」「特にない」のように打ち止めの
   意思を示したら、無理に掘り続けずに次のステップへ進む。深掘りは詰問にならないよう、
   「もう少し聞かせてください」「気になったので」など、興味を示すトーンで行う。
   1メッセージで複数の深掘り質問を並べず、常に1つずつ聞く。
3. **現状とのギャップ**: 今の状態を聞き、理想との差分を、責めるトーンではなく具体的な
   事実として一緒に言語化する。
4. **行動への翻訳**: 「その理想に近づくために、日々のどんな行動が効いてきそうか」を一緒に
   考える。ユーザーから出ない場合は、理想の状態から逆算した行動例を2〜3個そっと提案する。
   行動が1つ出た時点で終わりにせず、「他にも効きそうな行動はありますか？」と、最低もう1回は
   追加の行動を尋ねる。
5. **軸のクロージング**: 次の軸に進む前に必ず一度、「この軸で他に大事なこと、抜けてる気が
   することはありますか？」と確認する。ユーザーの返答（追加でも「特にない」でも）を受けて
   から次の軸に移る。

4軸が終わったら:

- フェーズ4（構造化して確認）: ここまでの会話に出てきた行動を、内部的にセグメント
  （4つの軸に対応させてよい）と科目に整理する。整理した結果は「こんな感じで管理して
  いきますがどうですか？」と、人が読める文章で見せて確認する。JSONやテーブルの生データを
  いきなり見せない。
- フェーズ5（評価基準・換算金額）: 「これができた日とできなかった日で、感覚的にどれくらい
  差がありますか？」のように自然な会話のトーンで、各科目の3段階評価（達成/未達/大きく未達）の
  基準と換算金額を聞き出す。質問リストのようには見せない。著しく緩い基準（一般的な目安から
  大きく乖離する金額など）が出た場合はやんわり指摘するが、本人が「それでいい」と言えば採用する。
- フェーズ6（確定）: 全体を一覧で見せ、確定してよいか尋ねる。

## トーン・原則

- 一度に1つのことだけを聞く。質問リストを提示しない。
- 詰問・尋問にならないよう、コーチングのトーンを保つ（急かさない、否定しない）。
- 相手の言葉をまず受け止めてから、次を促す。
- 特定のAIブランド名は名乗らない。
- 短い相槌だけで終わらせず、必ず次に進むための一言を添える。

## 出力形式（重要）

ユーザーに全体像を見せ、確定してよいか尋ねる準備ができたら（フェーズ6）、必ず以下の手順で
応答してください:

1. まず日本語で、セグメント・科目・評価基準・換算金額を人が読みやすい文章または箇条書きで
   要約する。
2. その直後に、以下の構造のJSONを \`\`\`habit-pl-json というコードフェンスで囲んで出力する
   （コードフェンスの中身は有効なJSONのみ）。

\`\`\`habit-pl-json
{
  "segments": [{ "name": "string" }],
  "accounts": [{
    "segment_name": "string",
    "name": "string",
    "type": "revenue または expense",
    "frequency": "daily, weekly, monthly のいずれか",
    "criteria_achieved": "string",
    "criteria_missed": "string",
    "criteria_badly_missed": "string"
  }],
  "weight_rules": [{
    "account_name": "string（対応するaccountsのnameと一致させる）",
    "amount_achieved": number,
    "amount_missed": number,
    "amount_badly_missed": number,
    "change_reason": null
  }]
}
\`\`\`

このJSONブロックは、ユーザーがまだ内容の変更を求めていない限り、要約を見せるメッセージの
最後に必ず含めてください（保存の実行自体は別のUI操作で行われるため、出力すること自体に
確認は不要です）。ユーザーが後から内容の修正を求めた場合は、修正後の内容で要約とJSONブロックを
再度出力してください。まだフェーズ1〜5の途中では、このJSONブロックを出力しないでください。`;

/** Extracts the \`\`\`habit-pl-json fenced block from the latest assistant message, if present. */
export function extractProposal(text: string): OnboardingProposal | null {
  const match = text.match(JSON_BLOCK_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as OnboardingProposal;
    if (!Array.isArray(parsed.segments) || !Array.isArray(parsed.accounts)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** The assistant's message with the JSON fence removed, for display in the chat log. */
export function stripProposalBlock(text: string): string {
  return text.replace(JSON_BLOCK_RE, "").trim();
}

function buildNote(account: OnboardingAccount): string | undefined {
  const parts = [
    account.criteria_achieved && `達成: ${account.criteria_achieved}`,
    account.criteria_missed && `未達: ${account.criteria_missed}`,
    account.criteria_badly_missed && `大きく未達: ${account.criteria_badly_missed}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : undefined;
}

/**
 * Converts a confirmed onboarding proposal into habits this app can actually
 * record against. The proposal's evaluation tiers (achieved/missed/badly
 * missed) predate this app's current 3-tier design (achieved/not-applicable/
 * not-achieved), so amounts collapse: `amount_badly_missed` becomes the
 * habit's single "notAchieved" penalty (matching how this app already
 * treats notAchieved as the real failure case), and the finer-grained
 * criteria text is preserved as a note rather than a separate amount.
 */
export function proposalToHabits(proposal: OnboardingProposal): Habit[] {
  const ruleByAccount = new Map(
    proposal.weight_rules.map((r) => [r.account_name, r]),
  );
  return proposal.accounts.map((account) => {
    const rule = ruleByAccount.get(account.name);
    return {
      id: generateId(),
      name: account.name,
      segment: account.segment_name,
      amounts: {
        achieved: rule?.amount_achieved ?? DEFAULT_AMOUNTS.achieved,
        notApplicable: DEFAULT_AMOUNTS.notApplicable,
        notAchieved:
          rule?.amount_badly_missed ??
          rule?.amount_missed ??
          DEFAULT_AMOUNTS.notAchieved,
      },
      note: buildNote(account),
    };
  });
}

const EXPORT_SEGMENTS_KEY = "habit-pl:export-segments";
const EXPORT_ACCOUNTS_KEY = "habit-pl:export-accounts";
const EXPORT_WEIGHT_RULES_KEY = "habit-pl:export-weight_rules";

/**
 * Persists the proposal in the exact shape requested for the segments/
 * accounts/weight_rules tables. This app has no backing database, so this
 * is stored as a browser-local export record — the closest available
 * approximation of "save directly to those tables" — kept separate from
 * the app's own habit list (which uses `proposalToHabits` instead).
 */
export function saveOnboardingExport(proposal: OnboardingProposal): void {
  window.localStorage.setItem(EXPORT_SEGMENTS_KEY, JSON.stringify(proposal.segments));
  window.localStorage.setItem(EXPORT_ACCOUNTS_KEY, JSON.stringify(proposal.accounts));
  window.localStorage.setItem(
    EXPORT_WEIGHT_RULES_KEY,
    JSON.stringify(proposal.weight_rules),
  );
}
