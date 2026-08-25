import type { BlastRadiusEntry } from "@/lib/queries/types";

/**
 * The blast radius, drawn literally: the package at the centre, each affected
 * application placed on a ring whose distance from the centre is its hop
 * count. Reading the picture and reading the metaphor are the same act.
 *
 * Hand-rolled SVG rather than a graph library. This layout is deterministic —
 * at most six nodes at known angles and radii — so a force simulation would
 * add a client bundle, a mount-time layout pass and a container-sizing problem
 * to arrange six points on a circle. Inline SVG renders on the server, costs
 * no JavaScript, scales with the viewport, and picks up the theme through the
 * same CSS custom properties as the rest of the page.
 */

const WIDTH = 640;
const HEIGHT = 380;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const INNER_RADIUS = 46;
const OUTER_RADIUS = 150;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + "…";
}

export function BlastRadiusDiagram({
  packageName,
  affected,
}: {
  packageName: string;
  affected: BlastRadiusEntry[];
}) {
  if (affected.length === 0) return null;

  // One ring per distinct hop distance, evenly spaced outward. Using distinct
  // values rather than raw hop numbers keeps the rings legible when every
  // application happens to sit at, say, 2 and 5 hops.
  const distances = [...new Set(affected.map((entry) => entry.hops))].sort((a, b) => a - b);
  const radiusFor = (hops: number) => {
    if (distances.length === 1) return OUTER_RADIUS;
    const index = distances.indexOf(hops);
    return INNER_RADIUS + 36 + (index / (distances.length - 1)) * (OUTER_RADIUS - INNER_RADIUS - 36);
  };

  const nodes = affected.map((entry, index) => {
    // Offset by half a step so no node lands at the top of the circle, which
    // is where the ring labels are drawn. Without this the nearest application
    // name sits directly on top of the "1 hop" label.
    const step = (Math.PI * 2) / affected.length;
    const angle = index * step - Math.PI / 2 + step / 2;
    const radius = radiusFor(entry.hops);
    return {
      entry,
      x: CX + Math.cos(angle) * radius,
      y: CY + Math.sin(angle) * radius,
      // Labels flip side so text never runs back over the diagram.
      anchor: (Math.cos(angle) < -0.25
        ? "end"
        : Math.cos(angle) > 0.25
          ? "start"
          : "middle") as "start" | "middle" | "end",
      offsetX: Math.cos(angle) < -0.25 ? -12 : Math.cos(angle) > 0.25 ? 12 : 0,
      offsetY: Math.sin(angle) > 0.5 ? 22 : Math.sin(angle) < -0.5 ? -16 : 4,
    };
  });

  return (
    <figure className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mx-auto h-auto w-full max-w-2xl"
        role="img"
        aria-label={
          packageName +
          " reaches " +
          affected.length +
          " applications: " +
          affected
            .map((e) => e.name + " at " + e.hops + (e.hops === 1 ? " hop" : " hops"))
            .join(", ")
        }
      >
        {/* Distance rings, drawn first so everything else sits above them. */}
        {distances.map((hops) => (
          <g key={hops}>
            <circle
              cx={CX}
              cy={CY}
              r={radiusFor(hops)}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={CX}
              y={CY - radiusFor(hops) - 6}
              textAnchor="middle"
              className="fill-[var(--text-subtle)] text-[10px]"
            >
              {hops} {hops === 1 ? "hop" : "hops"}
            </text>
          </g>
        ))}

        {nodes.map((node) => (
          <line
            key={"edge-" + node.entry.slug}
            x1={CX}
            y1={CY}
            x2={node.x}
            y2={node.y}
            stroke="var(--border-strong)"
            strokeWidth="1.5"
          />
        ))}

        {/* Centre: the package itself. */}
        <circle cx={CX} cy={CY} r={INNER_RADIUS} fill="var(--accent-soft)" />
        <circle
          cx={CX}
          cy={CY}
          r={INNER_RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <text
          x={CX}
          y={CY + 4}
          textAnchor="middle"
          className="fill-[var(--accent)] font-mono text-[11px] font-medium"
        >
          {truncate(packageName, 14)}
        </text>

        {nodes.map((node) => (
          <g key={"node-" + node.entry.slug}>
            <circle cx={node.x} cy={node.y} r="7" fill="var(--surface)" />
            <circle
              cx={node.x}
              cy={node.y}
              r="7"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            <text
              x={node.x + node.offsetX}
              y={node.y + node.offsetY}
              textAnchor={node.anchor}
              className="fill-[var(--text)] text-[12px] font-medium"
            >
              {node.entry.name}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="border-t border-border-subtle px-4 py-2.5 text-[12px] text-text-muted">
        Each ring is one hop further from{" "}
        <span className="font-mono text-text">{packageName}</span>. Applications on the inner ring
        depend on it almost directly; those further out inherit it through packages nobody chose.
      </figcaption>
    </figure>
  );
}
