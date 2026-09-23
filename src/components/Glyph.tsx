// Small line icon for each equipment category (from the prototype).
const PATHS: Record<string, React.ReactNode> = {
  "Lab & safety": (
    <path d="M3 10.5c0-2 2-3.5 9-3.5s9 1.5 9 3.5v2c0 2-1.5 3.5-3.5 3.5-1.6 0-2.4-1-3-2.2-.5-1-1-1.3-2.5-1.3s-2 .3-2.5 1.3C8 15 7.1 16 5.5 16 3.5 16 3 14.5 3 12.5z" />
  ),
  Measuring: <path d="M3 7h18v5H3zM6 7v2.5M9 7v3.5M12 7v2.5M15 7v3.5M18 7v2.5M5 12v6M9 12v4" />,
  Tech: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2.5 19h19" />
    </>
  ),
  "Camera & AV": (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M8.5 7l1.5-2.5h4L15.5 7" />
    </>
  ),
  Everyday: <path d="M3 12a9 9 0 0 1 18 0zM12 12v6.5a2 2 0 0 1-4 0" />,
  "Health & access": (
    <>
      <path d="M12 5v14M5 12h14" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    </>
  ),
};

export default function Glyph({ category }: { category: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 flex-none place-items-center rounded-[10px] bg-surface-2 text-ink-2"
    >
      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        {PATHS[category] ?? <circle cx="12" cy="12" r="7" />}
      </svg>
    </span>
  );
}
