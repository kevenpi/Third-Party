"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceDot,
  ReferenceLine,
  YAxis,
} from "recharts";
import type { MessageCorrelation, HRDataPoint } from "@/lib/biometrics";
import { formatElapsed, getAnnotationBorderColor } from "@/lib/biometrics";

interface SpikeAnalysisPanelProps {
  correlation: MessageCorrelation;
  hrTimeline: HRDataPoint[];
  baseline: { hr: number; hrv: number; stress: number };
  isOpen: boolean;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  currentIndex: number;
  totalCount: number;
}

function AnimatedBar({
  label,
  before,
  after,
  max,
  unit,
  inverted,
  delay,
}: {
  label: string;
  before: number;
  after: number;
  max: number;
  unit: string;
  inverted?: boolean;
  delay: number;
}) {
  const change = after - before;
  const pct = Math.round(Math.abs(change / before) * 100);
  const isWorse = inverted ? change < 0 : change > 0;
  const beforeWidth = Math.min(95, (before / max) * 100);
  const afterWidth = Math.min(95, (after / max) * 100);

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
          fontFamily: "Plus Jakarta Sans, sans-serif",
        }}
      >
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            {before}{unit}
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>-</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>
            {after}{unit}
          </span>
          <span
            style={{
              fontSize: 11,
              color: isWorse ? "#D4806A" : "#7AB89E",
              fontWeight: 600,
              marginLeft: 4,
            }}
          >
            ({change > 0 ? "+" : ""}{pct}%)
          </span>
        </div>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Before bar (muted) */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${beforeWidth}%` }}
          transition={{ duration: 0.4, delay, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            background: isWorse ? "rgba(212,128,106,0.25)" : "rgba(122,184,158,0.25)",
            borderRadius: 2,
          }}
        />
        {/* After bar (solid) */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${afterWidth}%` }}
          transition={{ duration: 0.5, delay: delay + 0.15, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            background: isWorse
              ? "linear-gradient(90deg, #7AB89E, #D4806A)"
              : "linear-gradient(90deg, #D4806A, #7AB89E)",
            borderRadius: 2,
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  );
}

export default function SpikeAnalysisPanel({
  correlation: c,
  hrTimeline,
  baseline,
  isOpen,
  onClose,
  onPrev,
  onNext,
  currentIndex,
  totalCount,
}: SpikeAnalysisPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const borderColor = getAnnotationBorderColor(c.annotation.type);
  const isStressSpike = c.stressAfter > c.stressBefore;

  // Get zoomed HR data: +/- 30 seconds around this spike
  const spikeElapsed = c.elapsed;
  const windowStart = Math.max(0, spikeElapsed - 30);
  const windowEnd = spikeElapsed + 30;
  const miniChartData = hrTimeline.filter(
    (d) => d.elapsed >= windowStart && d.elapsed <= windowEnd
  );

  // Format elapsed as "X:XX into conversation"
  const minutes = Math.floor(spikeElapsed / 60);
  const seconds = spikeElapsed % 60;
  const elapsedLabel = `${minutes}:${String(seconds).padStart(2, "0")} into conversation`;

  // Long text with paragraph breaks
  const longText = c.annotation.longText || c.annotation.text;
  const paragraphs = longText.split("\n\n").filter(Boolean);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 90,
            }}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "85vw",
              maxWidth: 420,
              background: "#1E1B18",
              borderLeft: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
              zIndex: 100,
              overflowY: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {/* Header */}
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "#1E1B18",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "rgba(255,255,255,0.5)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                }}
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <span
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                }}
              >
                {elapsedLabel}
              </span>
            </div>

            <div style={{ padding: "20px 20px 100px 20px" }}>
              {/* Quote Card */}
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 16,
                  padding: "24px 20px",
                  borderLeft: `3px solid ${isStressSpike ? "#D4806A" : "#7AB89E"}`,
                  marginBottom: 28,
                }}
              >
                <p
                  style={{
                    fontSize: 18,
                    fontStyle: "italic",
                    color: "rgba(255,255,255,0.9)",
                    lineHeight: 1.6,
                    marginBottom: 12,
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    fontWeight: 400,
                  }}
                >
                  &ldquo;{c.messagePreview}&rdquo;
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "#C4B496",
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    fontWeight: 500,
                  }}
                >
                  - {c.sender}
                </p>
              </div>

              {/* Biometric Impact */}
              <div style={{ marginBottom: 28 }}>
                <p
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "rgba(255,255,255,0.3)",
                    marginBottom: 16,
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Your body&apos;s response
                </p>

                <AnimatedBar
                  label="Heart Rate"
                  before={c.hrBefore}
                  after={c.hrAfter}
                  max={120}
                  unit=" bpm"
                  delay={0.1}
                />
                <AnimatedBar
                  label="HRV"
                  before={c.hrvBefore}
                  after={c.hrvAfter}
                  max={70}
                  unit=" ms"
                  inverted
                  delay={0.3}
                />
                <AnimatedBar
                  label="Stress Score"
                  before={c.stressBefore}
                  after={c.stressAfter}
                  max={100}
                  unit=""
                  delay={0.5}
                />
              </div>

              {/* What Happened */}
              <div style={{ marginBottom: 28 }}>
                <p
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "rgba(255,255,255,0.3)",
                    marginBottom: 12,
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    fontWeight: 500,
                  }}
                >
                  What happened
                </p>

                {/* Label with icon */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: `${borderColor}22`,
                      border: `1.5px solid ${borderColor}`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
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
                      fontSize: 15,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.9)",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                    }}
                  >
                    {c.annotation.label}
                  </span>
                </div>

                {/* Analysis paragraphs */}
                {paragraphs.map((para, idx) => (
                  <p
                    key={idx}
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.65)",
                      lineHeight: 1.7,
                      marginBottom: 14,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {para}
                  </p>
                ))}

                {/* Human comparison callout */}
                {c.annotation.humanComparison && (
                  <div
                    style={{
                      background: "rgba(212,176,122,0.08)",
                      border: "1px solid rgba(212,176,122,0.15)",
                      borderRadius: 12,
                      padding: "12px 16px",
                      marginTop: 8,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 12,
                        color: "#D4B07A",
                        fontStyle: "italic",
                        lineHeight: 1.5,
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                      }}
                    >
                      {c.annotation.humanComparison}
                    </p>
                  </div>
                )}
              </div>

              {/* Pattern Context Card */}
              {c.annotation.pattern && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 12,
                    padding: "16px 18px",
                    marginBottom: 28,
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "rgba(255,255,255,0.3)",
                      marginBottom: 10,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      fontWeight: 500,
                    }}
                  >
                    Pattern
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.65)",
                      lineHeight: 1.6,
                      marginBottom: 8,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                    }}
                  >
                    {c.annotation.pattern.description}
                    {c.annotation.pattern.avgRecovery !== "N/A - no recovery needed" &&
                      c.annotation.pattern.avgRecovery !== "N/A - these moments improve your baseline" &&
                      c.annotation.pattern.avgRecovery !== "N/A - this IS recovery" &&
                      c.annotation.pattern.avgRecovery !== "Immediate" &&
                      c.annotation.pattern.avgRecovery !== "Immediate - reassuring others IS your recovery" && (
                        <span>
                          {" "}Average recovery: {c.annotation.pattern.avgRecovery}.
                        </span>
                      )}
                  </p>
                  {c.annotation.pattern.relatedConversations.length > 0 && (
                    <p
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.3)",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                      }}
                    >
                      See also:{" "}
                      {c.annotation.pattern.relatedConversations.map((conv, idx) => (
                        <span key={idx}>
                          {idx > 0 && " · "}
                          <span style={{ color: "#C4B496", cursor: "pointer" }}>{conv.person} ({conv.date})</span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )}

              {/* Mini Chart */}
              {miniChartData.length > 2 && (
                <div style={{ marginBottom: 28 }}>
                  <p
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "rgba(255,255,255,0.3)",
                      marginBottom: 8,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      fontWeight: 500,
                    }}
                  >
                    HR around this moment
                  </p>
                  <div
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 12,
                      padding: "12px 8px 4px 8px",
                    }}
                  >
                    <ResponsiveContainer width="100%" height={100}>
                      <AreaChart
                        data={miniChartData}
                        margin={{ top: 5, right: 5, bottom: 0, left: 5 }}
                      >
                        <defs>
                          <linearGradient id="miniHrGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#D4806A" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#D4806A" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <YAxis
                          domain={[
                            Math.min(...miniChartData.map((d) => d.hr)) - 3,
                            Math.max(...miniChartData.map((d) => d.hr)) + 3,
                          ]}
                          hide
                        />
                        <ReferenceLine
                          x={spikeElapsed}
                          stroke="rgba(212,176,122,0.4)"
                          strokeDasharray="4 4"
                        />
                        <Area
                          type="monotone"
                          dataKey="hr"
                          stroke="#D4806A"
                          strokeWidth={1.5}
                          fill="url(#miniHrGrad)"
                          dot={false}
                          animationDuration={800}
                        />
                        <ReferenceDot
                          x={spikeElapsed}
                          y={
                            miniChartData.find((d) => d.elapsed === spikeElapsed)?.hr ??
                            c.hrAfter
                          }
                          r={5}
                          fill="#D4B07A"
                          stroke="#1E1B18"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Navigation between spikes */}
              {totalCount > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 8,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <button
                    onClick={onPrev ?? undefined}
                    disabled={!onPrev}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      color: onPrev ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                      background: "none",
                      border: "none",
                      cursor: onPrev ? "pointer" : "default",
                      fontSize: 12,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      padding: "8px 0",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (onPrev) (e.currentTarget.style.color = "#C4B496");
                    }}
                    onMouseLeave={(e) => {
                      if (onPrev) (e.currentTarget.style.color = "rgba(255,255,255,0.5)");
                    }}
                  >
                    <ChevronLeft size={14} />
                    Previous moment
                  </button>
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.2)",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                    }}
                  >
                    {currentIndex + 1} / {totalCount}
                  </span>
                  <button
                    onClick={onNext ?? undefined}
                    disabled={!onNext}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      color: onNext ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                      background: "none",
                      border: "none",
                      cursor: onNext ? "pointer" : "default",
                      fontSize: 12,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      padding: "8px 0",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (onNext) (e.currentTarget.style.color = "#C4B496");
                    }}
                    onMouseLeave={(e) => {
                      if (onNext) (e.currentTarget.style.color = "rgba(255,255,255,0.5)");
                    }}
                  >
                    Next moment
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
