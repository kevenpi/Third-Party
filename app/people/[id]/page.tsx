"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Dot,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonProfile {
  id: string;
  name: string;
  description: string;
  stats: string;
  colorBand: string[];
  conversations: ConvEntry[];
  photoCount: number;
  isEnrolled: boolean;
  totalDurationMin: number;
  avatarUrl?: string | null;
}

interface ConvEntry {
  id?: string;
  sessionId?: string;
  date: string;
  time: string;
  color: string;
  size: "small" | "medium" | "large";
  durationMin?: number;
  dateFormatted?: string;
}

interface BiometricSummary {
  avgHr: number;
  avgHrv: number;
  avgStress: number;
  avgRecoveryMin: number;
  conversationCount: number;
  peakStress: number;
}

interface ConversationBio {
  sessionId: string;
  date: string;
  avgStress: number;
  peakStress: number;
  avgHr: number;
  participant: string;
}

// ---------------------------------------------------------------------------
// Hardcoded demo data per person
// ---------------------------------------------------------------------------

// DEMO DATA - DO NOT EDIT
// Hardcoded comparison data for each person. Used for the demo.
// These numbers are derived from the biometric session files.
const PERSON_BIO_STATS: Record<string, BiometricSummary> = {
  arthur: {
    avgHr: 84,
    avgHrv: 32,
    avgStress: 62,
    avgRecoveryMin: 9,
    conversationCount: 4,
    peakStress: 78,
  },
  tane: {
    avgHr: 67,
    avgHrv: 53,
    avgStress: 16,
    avgRecoveryMin: 0,
    conversationCount: 3,
    peakStress: 35,
  },
  kevin: {
    avgHr: 72,
    avgHrv: 44,
    avgStress: 32,
    avgRecoveryMin: 3,
    conversationCount: 3,
    peakStress: 45,
  },
  jessica: {
    avgHr: 76,
    avgHrv: 40,
    avgStress: 38,
    avgRecoveryMin: 6,
    conversationCount: 2,
    peakStress: 55,
  },
};

const PERSON_COLORS: Record<string, string> = {
  arthur: "#6AAAB4",
  tane: "#C4B496",
  kevin: "#D4B07A",
  jessica: "#E8A0BF",
};

// Stress trend data per person (avg stress per conversation over last 7 days)
const STRESS_TRENDS: Record<string, { date: string; stress: number }[]> = {
  arthur: [
    { date: "Feb 8", stress: 45 },
    { date: "Feb 9", stress: 52 },
    { date: "Feb 10", stress: 38 },
    { date: "Feb 11", stress: 48 },
    { date: "Feb 12", stress: 55 },
    { date: "Feb 13", stress: 62 },
  ],
  tane: [
    { date: "Feb 8", stress: 12 },
    { date: "Feb 9", stress: 15 },
    { date: "Feb 10", stress: 18 },
    { date: "Feb 11", stress: 10 },
    { date: "Feb 12", stress: 14 },
    { date: "Feb 13", stress: 16 },
  ],
  kevin: [
    { date: "Feb 8", stress: 28 },
    { date: "Feb 9", stress: 22 },
    { date: "Feb 10", stress: 35 },
    { date: "Feb 11", stress: 30 },
    { date: "Feb 12", stress: 26 },
    { date: "Feb 13", stress: 32 },
  ],
  jessica: [
    { date: "Feb 8", stress: 30 },
    { date: "Feb 9", stress: 34 },
    { date: "Feb 10", stress: 28 },
    { date: "Feb 11", stress: 36 },
    { date: "Feb 12", stress: 40 },
    { date: "Feb 13", stress: 38 },
  ],
};

// Behavioral patterns per person
const PERSON_PATTERNS: Record<
  string,
  { icon: string; label: string; frequency: string; color: string }[]
> = {
  arthur: [
    { icon: "!", label: "Defensive escalation", frequency: "3 times this week", color: "#B84A3A" },
    { icon: "x", label: "Going quiet when challenged", frequency: "2 times", color: "#D4806A" },
    { icon: "*", label: "Repair attempts after conflict", frequency: "2 times", color: "#7AB89E" },
    { icon: "~", label: "Voice raising during plans", frequency: "1 time", color: "#D4B07A" },
  ],
  tane: [
    { icon: "+", label: "Co-regulation through humor", frequency: "4 times this week", color: "#7AB89E" },
    { icon: "+", label: "Deep listening presence", frequency: "3 times", color: "#6AAAB4" },
    { icon: "!", label: "Absorbing others' stress", frequency: "1 time", color: "#D4B07A" },
  ],
  kevin: [
    { icon: "!", label: "Mild defensiveness around money", frequency: "2 times this week", color: "#D4B07A" },
    { icon: "+", label: "Problem-solving calms you", frequency: "3 times", color: "#7AB89E" },
    { icon: "~", label: "Clarification loops", frequency: "2 times", color: "#C4B496" },
  ],
  jessica: [
    { icon: "~", label: "Deflection with humor", frequency: "3 times this week", color: "#D4B07A" },
    { icon: "x", label: "Self-silencing ('whatever works')", frequency: "2 times", color: "#D4806A" },
    { icon: "*", label: "Missing bids for honesty", frequency: "2 times", color: "#C4684A" },
    { icon: "~", label: "Conceding without real agreement", frequency: "1 time", color: "#B84A3A" },
  ],
};

// Conflict styles per person
const CONFLICT_STYLES: Record<string, string> = {
  arthur: "Sharp spikes (fight-or-flight)",
  tane: "Flat (calm baseline)",
  kevin: "Moderate waves (problem-solving)",
  jessica: "Slow burn (suppressed tension)",
};

// AI insights per person
const AI_INSIGHTS: Record<string, string> = {
  arthur:
    "Your conversations with Arthur have gotten progressively more stressful over the past two weeks. The pattern is consistent: practical topics (trips, plans, shared responsibilities) trigger sharp physiological responses - your HR spikes 50% above baseline and HRV drops below 26ms. But your evening check-ins are calm, with stress scores under 10. The relationship itself is not the problem. The topics are. Your body responds to Arthur's directness as pressure when you have not made a decision yet. Consider addressing the planning tension directly when your body is calm (HR under 68, stress under 15) rather than letting it surface during logistics conversations where your nervous system is already primed for fight-or-flight.",
  tane:
    "Tane is your most physiologically restorative relationship. Your average HR during Tane conversations is 67 bpm - 20% lower than with Arthur and 12% lower than with Kevin. Your HRV averages 53ms, the highest across all your relationships, indicating strong parasympathetic engagement. Even when Tane vents about work stress and your HR rises empathetically to 76 bpm, your HRV stays above 42ms - you never cross into threat mode. The data shows something specific: shared humor with Tane produces 3-5 minute windows of deepened calm (HRV spikes to 58ms). No other relationship in your data produces this effect. Tane is a co-regulating presence for your nervous system.",
  kevin:
    "Kevin conversations occupy the middle ground of your stress spectrum. Your average stress score with Kevin is 32 - moderate, rarely alarming, but rarely calm either. The pattern is transactional: practical topics produce mild friction (HR rises to 82 bpm around money or logistics), but you recover quickly because your problem-solving mode kicks in. When you propose solutions, your HR drops 5-8 bpm within 30 seconds. Your body rewards you for taking action. The risk with Kevin is that unresolved small frictions (like the subscription split yesterday at stress 45) accumulate without the repair conversations you have with Arthur. You solve problems with Kevin but rarely address the relationship underneath them.",
  jessica:
    "Jessica conversations have the most insidious stress pattern in your data. No single moment is alarming - your peak stress of 55 would barely register next to Arthur's 78. But the slow-burn pattern is physiologically expensive. Your HR climbs 37% from baseline (64 to 88) over 9 minutes without any obvious trigger. Your HRV drops steadily from 50 to 34ms. The signature of these conversations is self-silencing: every time you say 'whatever works' or 'sure, that sounds good,' your HR rises 2-3 bpm instead of dropping. Your body knows you are suppressing a preference. The humor deflections provide less than 20 seconds of relief before stress resumes climbing. The question is not whether Jessica's plans are wrong. It is whether you have ever told her what yours are.",
};

// Recent conversations with summaries
const RECENT_CONV_SUMMARIES: Record<
  string,
  { date: string; time: string; duration: string; summary: string; peakStress: number; color: string; id: string }[]
> = {
  arthur: [
    { date: "Feb 13", time: "12:40 PM", duration: "20 min", summary: "Trip planning turned tense when Arthur pushed for commitment", peakStress: 78, color: "#B84A3A", id: "bubble_seed_demo_arthur_1" },
    { date: "Feb 13", time: "9:05 PM", duration: "5 min", summary: "Quick check-in, Arthur apologized for being pushy", peakStress: 28, color: "#7AB89E", id: "bubble_seed_demo_arthur_2" },
    { date: "Feb 14", time: "7:08 AM", duration: "3 min", summary: "Calm morning start, shared a small laugh", peakStress: 17, color: "#7AB89E", id: "bubble_seed_arthur_1" },
    { date: "Feb 14", time: "12:45 PM", duration: "18 min", summary: "Weekend plans escalation, two stress waves", peakStress: 79, color: "#B84A3A", id: "bubble_seed_arthur_2" },
    { date: "Feb 14", time: "8:00 PM", duration: "35 min", summary: "Long evening repair, HR dropped 9% below baseline", peakStress: 16, color: "#7AB89E", id: "bubble_seed_arthur_3" },
  ],
  tane: [
    { date: "Feb 13", time: "10:30 AM", duration: "22 min", summary: "Long catch-up with stories and deep personal talk", peakStress: 18, color: "#7AB89E", id: "bubble_seed_demo_tane_1" },
    { date: "Feb 13", time: "3:15 PM", duration: "11 min", summary: "Tane venting about work, you listened", peakStress: 35, color: "#6AAAB4", id: "bubble_seed_demo_tane_2" },
    { date: "Feb 14", time: "10:30 AM", duration: "22 min", summary: "Restorative conversation, HRV peaked at 60ms", peakStress: 22, color: "#6AAAB4", id: "bubble_seed_tane_1" },
  ],
  kevin: [
    { date: "Feb 13", time: "9:25 AM", duration: "9 min", summary: "Splitting a subscription cost, small friction", peakStress: 45, color: "#D4B07A", id: "bubble_seed_demo_kevin_1" },
    { date: "Feb 13", time: "6:45 PM", duration: "4 min", summary: "Quick logistics about weekend plans", peakStress: 18, color: "#C4B496", id: "bubble_seed_demo_kevin_2" },
    { date: "Feb 14", time: "9:12 AM", duration: "8 min", summary: "Work discussion, deadline shift caused mild stress", peakStress: 43, color: "#C4B496", id: "bubble_seed_kevin_1" },
  ],
  jessica: [
    { date: "Feb 13", time: "8:30 PM", duration: "10 min", summary: "Spring break planning, quiet tension about priorities", peakStress: 55, color: "#E8A0BF", id: "bubble_seed_demo_jessica_1" },
  ],
};

// ---------------------------------------------------------------------------
// Custom dot for sparkline
// ---------------------------------------------------------------------------

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { stress: number };
}

function StressDot(props: DotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const color = payload.stress > 40 ? "#D4806A" : "#7AB89E";
  return <Dot cx={cx} cy={cy} r={4} fill={color} stroke="none" />;
}

// ---------------------------------------------------------------------------
// Comparison bar component
// ---------------------------------------------------------------------------

function ComparisonBar({
  label,
  value,
  maxValue,
  ranking,
  suffix,
}: {
  label: string;
  value: number;
  maxValue: number;
  ranking: string;
  suffix?: string;
}) {
  const pct = Math.min(100, (value / maxValue) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[rgba(255,255,255,0.5)]">{label}</span>
        <span className="text-xs font-medium text-[rgba(255,255,255,0.9)]">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <div className="h-2.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, #7AB89E 0%, #D4B07A 50%, #D4806A 75%, #B84A3A 100%)`,
          }}
        />
      </div>
      <p className="text-[10px] text-[rgba(255,255,255,0.35)]">{ranking}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PersonComparisonPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const personId = params.id as string;
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/people/${personId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [personId]);

  const bioStats = PERSON_BIO_STATS[personId] ?? null;
  const personColor = PERSON_COLORS[personId] ?? "#C4B496";
  const stressTrend = STRESS_TRENDS[personId] ?? [];
  const patterns = PERSON_PATTERNS[personId] ?? [];
  const conflictStyle = CONFLICT_STYLES[personId] ?? "Unknown";
  const aiInsight = AI_INSIGHTS[personId] ?? "";
  const recentConvs = RECENT_CONV_SUMMARIES[personId] ?? [];

  // Compute trend direction
  const trendDirection = useMemo(() => {
    if (stressTrend.length < 2) return "stable";
    const firstHalf = stressTrend.slice(0, Math.floor(stressTrend.length / 2));
    const secondHalf = stressTrend.slice(Math.floor(stressTrend.length / 2));
    const avgFirst =
      firstHalf.reduce((s, d) => s + d.stress, 0) / firstHalf.length;
    const avgSecond =
      secondHalf.reduce((s, d) => s + d.stress, 0) / secondHalf.length;
    const diff = avgSecond - avgFirst;
    if (diff > 5) return "increasing";
    if (diff < -5) return "decreasing";
    return "stable";
  }, [stressTrend]);

  // Build comparison rankings
  const allPeople = ["arthur", "tane", "kevin", "jessica"];
  const stressRanking = [...allPeople]
    .sort(
      (a, b) =>
        (PERSON_BIO_STATS[b]?.avgStress ?? 0) -
        (PERSON_BIO_STATS[a]?.avgStress ?? 0)
    )
    .map((id) => {
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      return name;
    })
    .join(" > ");

  const recoveryRanking = [...allPeople]
    .sort(
      (a, b) =>
        (PERSON_BIO_STATS[b]?.avgRecoveryMin ?? 0) -
        (PERSON_BIO_STATS[a]?.avgRecoveryMin ?? 0)
    )
    .map((id) => {
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      return name;
    })
    .join(" > ");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#12110F]">
        <p className="text-[rgba(255,255,255,0.7)]">Loading...</p>
      </div>
    );
  }

  const displayName =
    profile?.name ?? personId.charAt(0).toUpperCase() + personId.slice(1);
  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="min-h-screen bg-[#12110F] pb-20">
      {/* Navigation Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 text-[rgba(255,255,255,0.9)]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2
            className="text-lg font-normal"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {displayName}
          </h2>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-full mx-auto overflow-hidden">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full rounded-full flex items-center justify-center text-[#12110F] text-2xl font-semibold"
                style={{
                  background: `linear-gradient(135deg, ${personColor}, ${personColor}88)`,
                }}
              >
                {getInitials(displayName)}
              </div>
            )}
          </div>
          <h1
            className="text-3xl font-normal text-[rgba(255,255,255,0.95)]"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {displayName}
          </h1>
          {profile?.description && (
            <p
              className="text-[rgba(255,255,255,0.7)] leading-relaxed px-4"
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              {profile.description}
            </p>
          )}
          <p className="text-sm text-[rgba(255,255,255,0.4)]">
            {profile?.stats ?? ""}
          </p>
        </div>

        {/* Biometric Summary Card */}
        {bioStats && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">
              Your body with {displayName}
            </p>
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                className="h-1 rounded-full mb-4"
                style={{ backgroundColor: personColor, opacity: 0.6 }}
              />
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                <div>
                  <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
                    Avg HR during conversations
                  </p>
                  <p className="text-lg font-medium text-[rgba(255,255,255,0.95)]">
                    {bioStats.avgHr}{" "}
                    <span className="text-xs text-[rgba(255,255,255,0.4)]">
                      bpm
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
                    Avg HRV during conversations
                  </p>
                  <p className="text-lg font-medium text-[rgba(255,255,255,0.95)]">
                    {bioStats.avgHrv}{" "}
                    <span className="text-xs text-[rgba(255,255,255,0.4)]">
                      ms
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
                    Avg stress score
                  </p>
                  <p className="text-lg font-medium text-[rgba(255,255,255,0.95)]">
                    {bioStats.avgStress}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
                    Avg recovery time
                  </p>
                  <p className="text-lg font-medium text-[rgba(255,255,255,0.95)]">
                    {bioStats.avgRecoveryMin}{" "}
                    <span className="text-xs text-[rgba(255,255,255,0.4)]">
                      min
                    </span>
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
                <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
                  Conversations this week
                </p>
                <p className="text-lg font-medium text-[rgba(255,255,255,0.95)]">
                  {bioStats.conversationCount}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stress Trend Sparkline */}
        {stressTrend.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">
              Stress trend
            </p>
            <div
              className="rounded-2xl p-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stressTrend}>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={[0, 100]} />
                    <Line
                      type="monotone"
                      dataKey="stress"
                      stroke={personColor}
                      strokeWidth={2}
                      dot={<StressDot />}
                      activeDot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs mt-2" style={{ color: "#D4B07A" }}>
                Trend:{" "}
                {trendDirection === "increasing"
                  ? "^ increasing"
                  : trendDirection === "decreasing"
                    ? "v decreasing"
                    : "- stable"}
              </p>
            </div>
          </div>
        )}

        {/* Your Patterns */}
        {patterns.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">
              Your patterns
            </p>
            <div className="space-y-2">
              {patterns.map((pattern, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span
                    className="text-sm font-mono w-5 text-center"
                    style={{ color: pattern.color }}
                  >
                    {pattern.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[rgba(255,255,255,0.85)]">
                      {pattern.label}
                    </p>
                    <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
                      {pattern.frequency}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparison Bars */}
        {bioStats && (
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">
              How {displayName} compares
            </p>
            <div
              className="rounded-2xl p-5 space-y-5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <ComparisonBar
                label="Stress Level"
                value={bioStats.avgStress}
                maxValue={80}
                ranking={stressRanking}
                suffix=""
              />
              <ComparisonBar
                label="Recovery Time"
                value={bioStats.avgRecoveryMin}
                maxValue={12}
                ranking={recoveryRanking}
                suffix=" min"
              />
              <div className="space-y-1.5">
                <p className="text-xs text-[rgba(255,255,255,0.5)]">
                  Conflict Style
                </p>
                <p className="text-sm font-medium text-[rgba(255,255,255,0.9)]">
                  {conflictStyle}
                </p>
                <div className="text-[10px] text-[rgba(255,255,255,0.35)] space-y-0.5">
                  {allPeople
                    .filter((p) => p !== personId)
                    .map((p) => (
                      <p key={p}>
                        vs {p.charAt(0).toUpperCase() + p.slice(1)}:{" "}
                        {CONFLICT_STYLES[p] ?? "unknown"}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Conversations */}
        {recentConvs.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">
              Recent conversations
            </p>
            <div className="space-y-2">
              {recentConvs.map((conv, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    try {
                      sessionStorage.setItem(
                        `conv-person-${conv.id}`,
                        displayName
                      );
                    } catch {}
                    router.push(`/conversation/${conv.id}`);
                  }}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#2A2623] transition-all"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      backgroundColor: conv.color,
                      boxShadow: `0 0 6px ${conv.color}`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[rgba(255,255,255,0.5)]">
                        {conv.date}
                      </span>
                      <span className="text-xs text-[rgba(255,255,255,0.3)]">
                        {conv.time}
                      </span>
                      <span className="text-xs text-[rgba(255,255,255,0.3)]">
                        {conv.duration}
                      </span>
                    </div>
                    <p className="text-sm text-[rgba(255,255,255,0.75)] mt-0.5 line-clamp-1">
                      {conv.summary}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className="text-[11px] font-medium"
                      style={{
                        color:
                          conv.peakStress > 50
                            ? "#B84A3A"
                            : conv.peakStress > 30
                              ? "#D4B07A"
                              : "#7AB89E",
                      }}
                    >
                      {conv.peakStress}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Insight */}
        {aiInsight && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">
              What I noticed
            </p>
            <div
              className="rounded-2xl p-5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p
                className="text-[rgba(255,255,255,0.75)] leading-relaxed italic text-sm"
                style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
              >
                {aiInsight}
              </p>
            </div>
          </div>
        )}

        {/* Link to full profile */}
        <button
          onClick={() => router.push(`/glaze/${personId}`)}
          className="w-full py-3 px-6 rounded-xl text-sm text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.06)] hover:bg-[#2A2623] transition-all"
        >
          View full profile and enrollment
        </button>
      </div>
    </div>
  );
}
