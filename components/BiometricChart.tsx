"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import type { HRDataPoint, MessageCorrelation } from "@/lib/biometrics";
import { formatElapsed } from "@/lib/biometrics";

interface BiometricChartProps {
  data: HRDataPoint[];
  messageCorrelations: MessageCorrelation[];
  baseline: { hr: number; hrv: number; stress: number };
}

/* ── normalise each metric to 0-100 for overlay ── */
interface NormPoint {
  elapsed: number;
  hr: number;
  hrv: number;
  stress: number;
  hrNorm: number;
  hrvNorm: number;
  stressNorm: number;
}

function normalise(
  data: HRDataPoint[],
): { points: NormPoint[]; hrMin: number; hrMax: number; hrvMin: number; hrvMax: number } {
  if (data.length === 0)
    return { points: [], hrMin: 60, hrMax: 100, hrvMin: 20, hrvMax: 60 };

  const hrs = data.map((d) => d.hr);
  const hrvs = data.map((d) => d.hrv);
  const hrMin = Math.min(...hrs);
  const hrMax = Math.max(...hrs);
  const hrvMin = Math.min(...hrvs);
  const hrvMax = Math.max(...hrvs);

  const hrRange = hrMax - hrMin || 1;
  const hrvRange = hrvMax - hrvMin || 1;

  const points: NormPoint[] = data.map((d) => ({
    elapsed: d.elapsed,
    hr: d.hr,
    hrv: d.hrv,
    stress: d.stress,
    hrNorm: ((d.hr - hrMin) / hrRange) * 100,
    hrvNorm: ((d.hrv - hrvMin) / hrvRange) * 100,
    stressNorm: d.stress, // already 0-100
  }));

  return { points, hrMin, hrMax, hrvMin, hrvMax };
}

/* ── tooltip ── */
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as NormPoint | undefined;
  if (!d) return null;
  return (
    <div
      style={{
        background: "#1E1B18",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, margin: "0 0 6px 0" }}>
        {formatElapsed(d.elapsed)}
      </p>
      <div style={{ display: "flex", gap: 14 }}>
        <span style={{ fontSize: 12, color: "#D4806A" }}>
          HR <strong style={{ color: "#fff" }}>{d.hr}</strong>
        </span>
        <span style={{ fontSize: 12, color: "#7AB89E" }}>
          HRV <strong style={{ color: "#fff" }}>{d.hrv}</strong>
        </span>
        <span style={{ fontSize: 12, color: "#D4B07A" }}>
          Stress <strong style={{ color: "#fff" }}>{d.stress}</strong>
        </span>
      </div>
    </div>
  );
};

/* ── component ── */
export default function BiometricChart({
  data,
  messageCorrelations,
  baseline,
}: BiometricChartProps) {
  const { points, hrMin, hrMax, hrvMin, hrvMax } = useMemo(() => normalise(data), [data]);

  if (points.length === 0) return null;

  const peakHr = data.reduce((b, d) => (d.hr > b.hr ? d : b), data[0]);
  const peakStress = data.reduce((b, d) => (d.stress > b.stress ? d : b), data[0]);

  /* normalised baseline for HR reference line */
  const hrRange = hrMax - hrMin || 1;
  const baselineHrNorm = ((baseline.hr - hrMin) / hrRange) * 100;

  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      {/* Legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Heart Rate", color: "#D4806A", note: peakHr.hr > 80 ? `peak ${peakHr.hr}` : undefined },
          { label: "HRV", color: "#7AB89E", note: "(higher = calmer)" },
          { label: "Stress", color: "#D4B07A", note: peakStress.stress > 40 ? `peak ${peakStress.stress}` : undefined },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: item.color,
                boxShadow: `0 0 4px ${item.color}`,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontFamily: "Plus Jakarta Sans, sans-serif",
                fontWeight: 300,
              }}
            >
              {item.label}
            </span>
            {item.note && (
              <span
                style={{
                  fontSize: 9,
                  color: item.color,
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                  opacity: 0.7,
                }}
              >
                {item.note}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Unified Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={points} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
          <defs>
            <linearGradient id="hrAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4806A" stopOpacity={0.3} />
              <stop offset="60%" stopColor="#D4806A" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#D4806A" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="stressAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4B07A" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#D4B07A" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="elapsed"
            tickFormatter={formatElapsed}
            tick={{
              fontSize: 10,
              fill: "rgba(255,255,255,0.2)",
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis domain={[-5, 105]} hide />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)" }} />

          {/* HR baseline reference */}
          <ReferenceLine
            y={baselineHrNorm}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="4 4"
          />

          {/* Stress – filled area (back layer) */}
          <Area
            type="monotone"
            dataKey="stressNorm"
            stroke="#D4B07A"
            strokeWidth={1.5}
            fill="url(#stressAreaGrad)"
            dot={false}
            animationDuration={1200}
          />

          {/* HR – filled area (mid layer) */}
          <Area
            type="monotone"
            dataKey="hrNorm"
            stroke="#D4806A"
            strokeWidth={1.5}
            fill="url(#hrAreaGrad)"
            dot={false}
            animationDuration={1200}
          />

          {/* HRV – line only (top layer) */}
          <Line
            type="monotone"
            dataKey="hrvNorm"
            stroke="#7AB89E"
            strokeWidth={1.5}
            dot={false}
            animationDuration={1200}
          />

          {/* Message correlation dots – placed on HR line */}
          {messageCorrelations.map((c) => {
            const pt = points.find((p) => p.elapsed === c.elapsed);
            if (!pt) return null;
            return (
              <ReferenceDot
                key={`corr-${c.elapsed}`}
                x={c.elapsed}
                y={pt.hrNorm}
                r={5}
                fill="#D4B07A"
                stroke="#1E1B18"
                strokeWidth={2}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
