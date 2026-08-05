import { useState } from "react";
import {
  DEFAULT_AMOUNTS,
  EVALUATION_KEYS,
  EVALUATION_LABELS,
  SEGMENTS,
  SEGMENT_LABELS,
  type EvaluationAmounts,
  type Habit,
  type Segment,
} from "@/lib/habit-pl";

const amountInputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none";

const segmentSelectClass =
  "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none";

function SegmentSelect({
  value,
  onChange,
}: {
  value: Segment;
  onChange: (segment: Segment) => void;
}) {
  return (
    <select
      className={segmentSelectClass}
      value={value}
      onChange={(e) => onChange(e.target.value as Segment)}
      aria-label="セグメント"
    >
      {SEGMENTS.map((segment) => (
        <option key={segment} value={segment}>
          {SEGMENT_LABELS[segment]}
        </option>
      ))}
    </select>
  );
}

// A native <input type="number"> snaps its value back to 0 the moment the
// typed text is momentarily invalid (e.g. a lone "-" while entering a
// negative amount), which made it impossible to type more than one
// character at a time. This keeps the field as free text while the user is
// typing and only commits/normalizes to a number on blur.
function AmountInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  return (
    <input
      type="text"
      className={amountInputClass}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*$/.test(raw)) return;
        setText(raw);
        if (raw !== "" && raw !== "-") onCommit(Number(raw));
      }}
      onBlur={() => {
        if (text === "" || text === "-") {
          setText("0");
          onCommit(0);
        }
      }}
    />
  );
}

function AmountFields({
  amounts,
  onChange,
}: {
  amounts: EvaluationAmounts;
  onChange: (amounts: EvaluationAmounts) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {EVALUATION_KEYS.map((key) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">{EVALUATION_LABELS[key]}</span>
          <AmountInput
            value={amounts[key]}
            onCommit={(amount) => onChange({ ...amounts, [key]: amount })}
          />
        </label>
      ))}
    </div>
  );
}

function HabitRow({
  habit,
  onUpdate,
  onDelete,
}: {
  habit: Habit;
  onUpdate: (
    habitId: string,
    updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
  ) => void;
  onDelete: (habitId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <input
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-semibold text-gray-900 focus:border-gray-500 focus:outline-none"
          value={habit.name}
          onChange={(e) => onUpdate(habit.id, { name: e.target.value })}
          aria-label="科目名"
        />
        <button
          type="button"
          onClick={() => onDelete(habit.id)}
          className="shrink-0 rounded-md px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
        >
          削除
        </button>
      </div>
      <SegmentSelect
        value={habit.segment}
        onChange={(segment) => onUpdate(habit.id, { segment })}
      />
      <AmountFields
        amounts={habit.amounts}
        onChange={(amounts) => onUpdate(habit.id, { amounts })}
      />
    </div>
  );
}

export function HabitSettings({
  habits,
  onAdd,
  onUpdate,
  onDelete,
}: {
  habits: Habit[];
  onAdd: (name: string, segment: Segment, amounts: EvaluationAmounts) => void;
  onUpdate: (
    habitId: string,
    updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
  ) => void;
  onDelete: (habitId: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newSegment, setNewSegment] = useState<Segment>(SEGMENTS[0]);
  const [newAmounts, setNewAmounts] = useState<EvaluationAmounts>({
    ...DEFAULT_AMOUNTS,
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd(name, newSegment, newAmounts);
    setNewName("");
    setNewSegment(SEGMENTS[0]);
    setNewAmounts({ ...DEFAULT_AMOUNTS });
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">科目の設定</p>

      <div className="flex flex-col gap-3">
        {habits.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-gray-300 p-4">
        <input
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          placeholder="新しい科目名（例: 読書）"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <SegmentSelect value={newSegment} onChange={setNewSegment} />
        <AmountFields amounts={newAmounts} onChange={setNewAmounts} />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          科目を追加
        </button>
      </div>
    </section>
  );
}
