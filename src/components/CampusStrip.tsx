// The campus strip from the prototype: Steve Biko Campus drawn north (left)
// to south (right), with each locker node, the student's position (amber dot)
// and the walking minutes to each node. The same information is in the list
// of lockers below it, so screen readers skip the drawing.
export type StripNode = { id: string; position: number; minutes: number; hasStock: boolean; selected: boolean };

const W = 360;
const PAD = 16;
const x = (f: number) => PAD + f * (W - 2 * PAD);

export default function CampusStrip({ nodes, you }: { nodes: StripNode[]; you: number }) {
  return (
    <div aria-hidden="true" className="my-1.5 rounded-[14px] border border-line bg-surface-2 px-2.5 pt-2.5 pb-1.5">
      <svg viewBox={`0 0 ${W} 78`} className="block h-auto w-full">
        <rect x={PAD - 6} y="30" width={W - 2 * PAD + 12} height="18" rx="9" fill="var(--line)" />
        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={x(n.position) - 9}
              y="30"
              width="18"
              height="18"
              rx="4"
              fill={n.selected ? "var(--teal)" : n.hasStock ? "var(--slate)" : "var(--surface)"}
              stroke={n.hasStock ? "none" : "var(--ink-3)"}
              strokeDasharray="3 2"
            />
            <text x={x(n.position)} y="20" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">
              {n.id}
            </text>
            <text x={x(n.position)} y="66" textAnchor="middle" fontSize="10.5" fill="var(--ink-2)">
              {n.minutes} min
            </text>
          </g>
        ))}
        <circle cx={x(you)} cy="39" r="6.5" fill="var(--amber)" stroke="var(--surface)" strokeWidth="2.5" />
      </svg>
      <div className="flex justify-between px-1 pt-0.5 text-[0.78em] text-ink-3">
        <span>North: Botanic Gardens Rd</span>
        <span>South: Gate 7</span>
      </div>
    </div>
  );
}
