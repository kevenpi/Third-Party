"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import type { HRDataPoint, MessageCorrelation } from "@/lib/biometrics";
import { formatElapsed, getStressColor } from "@/lib/biometrics";

interface BiometricChartProps {
  data: HRDataPoint[];
  messageCorrelations: MessageCorrelation[];
  baseline: { hr: number; hrv: number; stress: number };
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
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
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ color: d.hr > 85 ? "#D4806A" : "#7AB89E", fontSize: 12 }}>
          HR <strong style={{ color: "#D4B07A" }}>{d.hr}</strong>
        </span>
        <span style={{ color: d.hrv < 35 ? "#D4806A" : "#7AB89E", fontSize: 12 }}>
          HRV <strong style={{ color: "#D4B07A" }}>{d.hrv}</strong>
        </span>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
          Stress <strong style={{ color: "#D4B07A" }}>{d.stress}</strong>
        </span>
      </div>
    </div>
  );
};

export default function BiometricChart({
  data,
  messageCorrelations,
  baseline,
}: BiometricChartProps) {
  const maxHr = Math.max(...data.map((d) => d.hr));
  const maxStress = Math.max(...data.map((d) => d.stress));

  // Find peak for label
  const peakPoint = data.reduce((best, d) => (d.hr > best.hr ? d : best), data[0]);
  const peakStressPoint = data.reduce((best, d) =>
    d.stress > best.stress ? d : best,
    data[0]
  );

  const correlationElapsed = new Set(messageCorrelations.map((c) => c.elapsed));

  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      {/* HR Chart */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#D4806A",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "Plus Jakarta Sans, sans-serif",
              fontWeight: 300,
            }}
          >
            Heart Rate
          </span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} syncId="bio" margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
            <defs>
              <linearGradient id="hrAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4806A" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#7AB89E" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#7AB89E" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis dataKey="elapsed" hide />
            <YAxis domain={[55, Math.max(110, maxHr + 5)]} hide />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
            <ReferenceLine
              y={baseline.hr}
              stroke="rgba(255,255,255,0.1)"
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="hr"
              stroke="#D4806A"
              strokeWidth={1.5}
              fill="url(#hrAreaGrad)"
              dot={false}
              animationDuration={1200}
            />
            {/* Message correlation dots */}
            {messageCorrelations.map((c) => {
              const point = data.find((d) => d.elapsed === c.elapsed) || data[0];
              return (
                <ReferenceDot
                  key={c.elapsed}
                  x={c.elapsed}
                  y={point?.hr ?? c.hrAfter}
                  r={5}
                  fill="#D4B07A"
                  stroke="#1E1B18"
                  strokeWidth={2}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
        {/* Peak label */}
        {maxHr > 80 && (
          <div
            style={{
              textAlign: "right",
              marginTop: -16,
              marginRight: 8,
              position: "relative",
              zIndex: 2,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "#D4806A",
                fontFamily: "Plus Jakarta Sans, sans-serif",
              }}
            >
              peak {peakPoint.hr}
            </span>
          </div>
        )}
      </div>

      {/* HRV Chart */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#7AB89E",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "Plus Jakarta Sans, sans-serif",
              fontWeight: 300,
            }}
          >
            HRV
          </span>
          <span
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.15)",
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}
          >
            (higher = calmer)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={data} syncId="bio" margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
            <XAxis dataKey="elapsed" hide />
            <YAxis domain={[15, 70]} hide />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
            <Line
              type="monotone"
              dataKey="hrv"
              stroke="#7AB89E"
              strokeWidth={1.5}
              dot={false}
              animationDuration={1200}
            />
            {messageCorrelations.map((c) => {
              const point = data.find((d) => d.elapsed === c.elapsed) || data[0];
              return (
                <ReferenceDot
                  key={c.elapsed}
                  x={c.elapsed}
                  y={point?.hrv ?? c.hrvAfter}
                  r={4}
                  fill="#D4B07A"
                  stroke="#1E1B18"
                  strokeWidth={2}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stress Chart */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#D4B07A",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "Plus Jakarta Sans, sans-serif",
              fontWeight: 300,
            }}
          >
            Stress
          </span>
        </div>
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={data} syncId="bio" margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
            <defs>
              <linearGradient id="stressAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4806A" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#D4806A" stopOpacity={0.03} />
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
            <YAxis domain={[0, 100]} hide />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
            <Area
              type="monotone"
              dataKey="stress"
              stroke="#D4B07A"
              strokeWidth={1.5}
              fill="url(#stressAreaGrad)"
              dot={false}
              animationDuration={1200}
            />
            {messageCorrelations.map((c) => {
              const point = data.find((d) => d.elapsed === c.elapsed) || data[0];
              return (
                <ReferenceDot
                  key={c.elapsed}
                  x={c.elapsed}
                  y={point?.stress ?? c.stressAfter}
                  r={4}
                  fill="#D4B07A"
                  stroke="#1E1B18"
                  strokeWidth={2}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
        {maxStress > 40 && (
          <div
            style={{
              textAlign: "right",
              marginTop: -14,
              marginRight: 8,
              position: "relative",
              zIndex: 2,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "#D4B07A",
                fontFamily: "Plus Jakarta Sans, sans-serif",
              }}
            >
              peak {peakStressPoint.stress}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
