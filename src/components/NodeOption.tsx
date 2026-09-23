// One locker in a "Collect from" list: a real radio button (so arrow keys
// work) styled as the prototype's card.
export default function NodeOption({
  name,
  value,
  checked,
  disabled,
  onChange,
  title,
  detail,
  minutes,
  warning,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  title: string;
  detail: string;
  minutes: number;
  warning?: string;
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-surface px-3 py-2.5 has-[:checked]:border-teal has-[:checked]:bg-teal-soft has-[:checked]:shadow-[inset_0_0_0_1px_var(--teal)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus) ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="size-5 flex-none rounded-full border-2 border-ink-3 peer-checked:border-6 peer-checked:border-teal"
      />
      <span className="min-w-0">
        <span className="block font-bold">{title}</span>
        <span className="block text-[0.85em] text-ink-2">{detail}</span>
        {warning && <span className="block text-[0.85em] font-bold text-amber">{warning}</span>}
      </span>
      <span className="ml-auto flex-none text-right text-[0.85em] text-ink-2">
        <b className="block text-[1.2em] text-ink">{minutes} min</b>walk
      </span>
    </label>
  );
}
