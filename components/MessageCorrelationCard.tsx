"use client";

import type { MessageCorrelation } from "@/lib/biometrics";
import { formatElapsed, formatBiometricChange, getAnnotationBorderColor } from "@/lib/biometrics";

interface MessageCorrelationCardProps {
  correlation: MessageCorrelation;
}

function ProgressBar({
  label,
  before,
  after,
  max,
  unit,
  inverted,
}: {
  label: string;
  before: number;
  after: number;
  max: number;
  unit?: string;
  inverted?: boolean;
}) {
  const change = after - before;
  const pct = Math.round(Math.abs(change / before) * 100);
  const isWorse = inverted ? change < 0 : change > 0;
  const barWidth = Math.min(95, (Math.max(before, after) / max) * 100);
  const baseWidth = Math.min(95, (Math.min(before, after) / max) * 100);

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 3,
          fontFamily: "Plus Jakarta Sans, sans-serif",
        }}
      >
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          {before}
          {unit ?? ""} → {after}
          {unit ?? ""}{" "}
          <span style={{ color: isWorse ? "#D4806A" : "#7AB89E", fontWeight: 500 }}>
            ({change > 0 ? "+" : ""}
            {pct}%)
          </span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 3,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${barWidth}%`,
            background: isWorse ? "rgba(212,128,106,0.2)" : "rgba(122,184,158,0.2)",
            borderRadius: 3,
            transition: "width 0.8s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${baseWidth}%`,
            background: isWorse ? "#D4806A" : "#7AB89E",
            borderRadius: 3,
            transition: "width 0.6s ease",
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
}

export default function MessageCorrelationCard({
  correlation: c,
}: MessageCorrelationCardProps) {
  const borderColor = getAnnotationBorderColor(c.annotation.type);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        borderRadius: 12,
        padding: 16,
        borderLeft: `3px solid ${borderColor}`,
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: `${borderColor}22`,
              border: `1.5px solid ${borderColor}`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: borderColor,
              fontFamily: "Plus Jakarta Sans, sans-serif",
              flexShrink: 0,
            }}
          >
            {c.annotation.icon}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: borderColor,
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}
          >
            {c.annotation.label}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }}
        >
          {formatElapsed(c.elapsed)}
        </span>
      </div>

      {/* Message quote */}
      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.6)",
          fontStyle: "italic",
          marginBottom: 4,
          lineHeight: 1.5,
          fontFamily: "Plus Jakarta Sans, sans-serif",
        }}
      >
        &ldquo;{c.messagePreview}&rdquo;
      </p>
      <p
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.3)",
          marginBottom: 12,
          fontFamily: "Plus Jakarta Sans, sans-serif",
        }}
      >
        — {c.sender}
      </p>

      {/* Progress bars */}
      <ProgressBar label="HR" before={c.hrBefore} after={c.hrAfter} max={120} unit=" bpm" />
      <ProgressBar
        label="HRV"
        before={c.hrvBefore}
        after={c.hrvAfter}
        max={65}
        unit=" ms"
        inverted
      />
      <ProgressBar label="Stress" before={c.stressBefore} after={c.stressAfter} max={100} />

      {/* Annotation text */}
      <p
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
          lineHeight: 1.6,
          marginTop: 12,
          fontFamily: "Plus Jakarta Sans, sans-serif",
        }}
      >
        {c.annotation.text}
      </p>
    </div>
  );
}
