import { useMemo } from "react";
import { arc as d3arc } from "d3-shape";

export interface WheelSegment {
  id: string;
  label: string;
}

interface RadialWheelProps {
  segments: WheelSegment[];
  highlightedId: string | null;
  centerLabel: string;
  size?: number;
}

const INNER_RADIUS = 34;
const OUTER_RADIUS = 100;
const CORNER_RADIUS = 14;
const PAD_ANGLE = 0.045;
const ACCENT = "#9400D3";

type ArcDatum = {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
};

export function RadialWheel({ segments, highlightedId, centerLabel, size = 220 }: RadialWheelProps) {
  const half = size / 2;
  const anglePer = (Math.PI * 2) / segments.length;

  const arcs = useMemo(() => {
    const generator = d3arc<ArcDatum>()
      .innerRadius((d) => d.innerRadius)
      .outerRadius((d) => d.outerRadius)
      .cornerRadius(CORNER_RADIUS)
      .padAngle(PAD_ANGLE);

    return segments.map((seg, i) => {
      const startAngle = i * anglePer;
      const endAngle = startAngle + anglePer;
      const datum: ArcDatum = {
        startAngle,
        endAngle,
        innerRadius: INNER_RADIUS,
        outerRadius: OUTER_RADIUS,
      };
      const d = generator(datum) ?? "";
      const [lx, ly] = generator.centroid(datum);
      return { seg, d, lx, ly };
    });
  }, [segments, anglePer]);

  return (
    <svg
      width={size}
      height={size}
      style={{ filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.16))", overflow: "visible" }}
    >
      <g transform={`translate(${half}, ${half})`}>
        {arcs.map(({ seg, d }) => (
          <path
            key={seg.id}
            d={d}
            fill={highlightedId === seg.id ? ACCENT : "#ececef"}
            style={{ transition: "fill 120ms ease" }}
          />
        ))}
        {arcs.map(({ seg, lx, ly }) => (
          <text
            key={seg.id}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={600}
            fill={highlightedId === seg.id ? "#ffffff" : "#48484f"}
            style={{ pointerEvents: "none", transition: "fill 120ms ease" }}
          >
            {seg.label}
          </text>
        ))}
        <circle r={INNER_RADIUS - 4} fill="white" />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={600}
          fill="#1a1a1a"
          style={{ pointerEvents: "none" }}
        >
          {centerLabel}
        </text>
      </g>
    </svg>
  );
}

/**
 * Determina qual fatia está sob o cursor, dado o deslocamento (dx, dy) em
 * pixels lógicos em relação ao centro da roda. Usa a mesma convenção do
 * d3-shape (ângulo 0 = topo, sentido horário).
 */
export function hitTestSegment(
  dx: number,
  dy: number,
  segments: WheelSegment[],
): string | null {
  const radius = Math.sqrt(dx * dx + dy * dy);
  if (radius < INNER_RADIUS - 4 || radius > OUTER_RADIUS + 24) {
    return null;
  }
  let angle = Math.atan2(dx, -dy);
  if (angle < 0) angle += Math.PI * 2;
  const anglePer = (Math.PI * 2) / segments.length;
  const index = Math.min(segments.length - 1, Math.floor(angle / anglePer));
  return segments[index]?.id ?? null;
}
