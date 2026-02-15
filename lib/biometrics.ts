import biometricsData from "@/data/biometrics.json";

export interface HRDataPoint {
  elapsed: number;
  hr: number;
  hrv: number;
  stress: number;
}

export interface MessageCorrelation {
  elapsed: number;
  messagePreview: string;
  sender: string;
  hrBefore: number;
  hrAfter: number;
  hrvBefore: number;
  hrvAfter: number;
  stressBefore: number;
  stressAfter: number;
  annotation: {
    type: "observation" | "missed_bid" | "pattern" | "positive";
    label: string;
    text: string;
    icon: string;
  };
}

export interface BiometricData {
  participant: string;
  startTime: string;
  duration: string;
  hrTimeline: HRDataPoint[];
  baseline: { hr: number; hrv: number; stress: number };
  peak: { hr: number; hrv: number; elapsedAt: number; stress: number };
  recovery: { minutes: number };
  messageCorrelations: MessageCorrelation[];
  overallInsight: string;
}

const staticData = biometricsData as {
  conversations: Record<string, BiometricData>;
};

/**
 * Get biometric data for a conversation.
 * Tries live data first (data/biometrics/{id}.json), falls back to static demo data.
 */
export async function getBiometricDataAsync(
  conversationId: string
): Promise<BiometricData | null> {
  // Try live data first (dynamic import to avoid SSR issues with fs)
  try {
    const { loadBiometricData } = await import("@/lib/biometricStorage");
    const live = await loadBiometricData(conversationId);
    if (live) return live;
  } catch {
    // Not in server context or file not found — fall through
  }
  // Fall back to static demo data
  return staticData.conversations[conversationId] ?? null;
}

/**
 * Synchronous fallback for client-side rendering (static data only).
 */
export function getBiometricData(
  conversationId: string
): BiometricData | null {
  return staticData.conversations[conversationId] ?? null;
}

export function getStressColor(stress: number): string {
  if (stress < 25) return "#7AB89E"; // calm sage
  if (stress < 40) return "#C4B496"; // neutral sand
  if (stress < 55) return "#D4B07A"; // warm amber
  if (stress < 70) return "#D4806A"; // tense coral
  if (stress < 80) return "#C4684A"; // tense sienna
  return "#B84A3A"; // stress red
}

export function getHrColor(hr: number, baseline: number): string {
  const pct = ((hr - baseline) / baseline) * 100;
  if (pct < 5) return "#7AB89E";
  if (pct < 15) return "#C4B496";
  if (pct < 25) return "#D4B07A";
  if (pct < 35) return "#D4806A";
  if (pct < 45) return "#C4684A";
  return "#B84A3A";
}

export function getHrvColor(hrv: number): string {
  if (hrv >= 50) return "#7AB89E"; // calm
  if (hrv >= 40) return "#C4B496"; // moderate
  if (hrv >= 35) return "#D4B07A"; // mild stress
  if (hrv >= 30) return "#D4806A"; // stressed
  return "#B84A3A"; // very stressed
}

export function formatBiometricChange(
  before: number,
  after: number
): string {
  const diff = after - before;
  const pct = Math.round((diff / before) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function interpolateHR(
  hrTimeline: HRDataPoint[],
  elapsed: number
): HRDataPoint {
  if (hrTimeline.length === 0) return { elapsed, hr: 65, hrv: 50, stress: 15 };

  // Find surrounding points
  let before = hrTimeline[0];
  let after = hrTimeline[hrTimeline.length - 1];

  for (let i = 0; i < hrTimeline.length - 1; i++) {
    if (hrTimeline[i].elapsed <= elapsed && hrTimeline[i + 1].elapsed >= elapsed) {
      before = hrTimeline[i];
      after = hrTimeline[i + 1];
      break;
    }
  }

  if (before.elapsed === after.elapsed) return before;

  const ratio = (elapsed - before.elapsed) / (after.elapsed - before.elapsed);
  return {
    elapsed,
    hr: Math.round(before.hr + (after.hr - before.hr) * ratio),
    hrv: Math.round(before.hrv + (after.hrv - before.hrv) * ratio),
    stress: Math.round(before.stress + (after.stress - before.stress) * ratio),
  };
}

export function getAnnotationBorderColor(type: string): string {
  switch (type) {
    case "observation":
      return "#D4806A"; // coral
    case "missed_bid":
      return "#B84A3A"; // stress red
    case "pattern":
      return "#D4B07A"; // gold
    case "positive":
      return "#7AB89E"; // sage
    default:
      return "#C4B496"; // sand
  }
}

export function getDailySummary() {
  const convIds = Object.keys(data.conversations);
  const all = convIds.map((id) => data.conversations[id]);

  const avgHr = Math.round(
    all.reduce(
      (sum, c) =>
        sum +
        c.hrTimeline.reduce((s, p) => s + p.hr, 0) / c.hrTimeline.length,
      0
    ) / all.length
  );

  const stressMoments = all.filter((c) => c.peak.stress > 50);

  const peakConv = all.reduce((best, c) =>
    c.peak.stress > best.peak.stress ? c : best
  );

  return {
    avgHr,
    stressMomentCount: stressMoments.length,
    peakStress: peakConv.peak.stress,
    peakPerson: peakConv.participant,
    peakTime: new Date(peakConv.startTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

export function getConversationPeakStress(conversationId: string): number {
  const conv = data.conversations[conversationId];
  return conv?.peak?.stress ?? 0;
}
