import { useState } from "react";
import {
  DEFAULT_AMOUNTS,
  EVALUATION_KEYS,
  EVALUATION_LABELS,
  type EvaluationAmounts,
  type Habit,
  type Segment,
} from "@/lib/habit-pl";

const amountInputClass =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none";

const segmentSelectClass =
  "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none";

const NEW_SEGMENT_OPTION = "__new__";

function SegmentSelect({
  segments,
  value,
  onChange,
  onAddSegment,
}: {
  segments: Segment[];
  value: Segment;
  onChange: (segment: Segment) => void;
  onAddSegment: (segment: Segment) => void;
}) {
  const [addingSegment, setAddingSegment] = useState(false);
  const [draftSegment, setDraftSegment] = useState("");

  if (addingSegment) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className={segmentSelectClass}
          placeholder="新しいセグメント名"
          value={draftSegment}
          onChange={(e) => setDraftSegment(e.target.value)}
          aria-label="新しいセグメント名"
        />
        <button
          type="button"
          onClick={() => {
            const name = draftSegment.trim();
            if (!name) return;
            onAddSegment(name);
            setDraftSegment("");
            setAddingSegment(false);
          }}
          disabled={!draftSegment.trim()}
          className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          追加
        </button>
        <button
          type="button"
          onClick={() => {
            setDraftSegment("");
            setAddingSegment(false);
          }}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <select
      className={segmentSelectClass}
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW_SEGMENT_OPTION) {
          setAddingSegment(true);
          return;
        }
        onChange(e.target.value);
      }}
      aria-label="セグメント"
    >
      {segments.map((segment) => (
        <option key={segment} value={segment}>
          {segment}
        </option>
      ))}
      <option value={NEW_SEGMENT_OPTION}>＋ 新しいセグメントを追加</option>
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
  segments,
  onUpdate,
  onDelete,
  onAddSegment,
}: {
  habit: Habit;
  segments: Segment[];
  onUpdate: (
    habitId: string,
    updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
  ) => void;
  onDelete: (habitId: string) => void;
  onAddSegment: (segment: Segment) => void;
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
      {habit.note && <p className="text-xs text-gray-400">{habit.note}</p>}
      <SegmentSelect
        segments={segments}
        value={habit.segment}
        onChange={(segment) => onUpdate(habit.id, { segment })}
        onAddSegment={(segment) => {
          onAddSegment(segment);
          onUpdate(habit.id, { segment });
        }}
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
  segments,
  onAdd,
  onUpdate,
  onDelete,
  onAddSegment,
}: {
  habits: Habit[];
  segments: Segment[];
  onAdd: (name: string, segment: Segment, amounts: EvaluationAmounts) => void;
  onUpdate: (
    habitId: string,
    updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
  ) => void;
  onDelete: (habitId: string) => void;
  onAddSegment: (segment: Segment) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newSegment, setNewSegment] = useState<Segment>(segments[0]);
  const [newAmounts, setNewAmounts] = useState<EvaluationAmounts>({
    ...DEFAULT_AMOUNTS,
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd(name, newSegment, newAmounts);
    setNewName("");
    setNewSegment(segments[0]);
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
            segments={segments}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAddSegment={onAddSegment}
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
        <SegmentSelect
          segments={segments}
          value={newSegment}
          onChange={setNewSegment}
          onAddSegment={(segment) => {
            onAddSegment(segment);
            setNewSegment(segment);
          }}
        />
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
