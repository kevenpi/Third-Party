export const MOMENT_LABELS = [
  "tension",
  "criticism",
  "defensiveness",
  "repair",
  "affection",
  "boundary",
  "misunderstanding"
] as const;

export type MomentLabel = (typeof MOMENT_LABELS)[number];

export interface SpikeWindow {
  id: string;
  startSec: number;
  endSec: number;
  peak?: number;
}

export interface Moment {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  shortQuote: string;
  labels: MomentLabel[];
  stressAligned: boolean;
  stressWindowId?: string;
  ignored?: boolean;
}

export interface MomentPromptSet {
  momentId: string;
  prompts: [string, string, string];
}

export interface DailySummary {
  patterns: string[];
  suggestedRepairAction: string;
  dailyInsight: string;
}

export interface AnalyzedDay {
  date: string;
  whoWith: string;
  stressProxyNotice: string;
  transcript: string;
  spikes: SpikeWindow[];
  moments: Moment[];
  promptSets: MomentPromptSet[];
  summary: DailySummary;
  createdAt: string;
}

export interface DailyReflection {
  momentId: string;
  isImportant: boolean;
  answers: [string, string, string];
}

export interface PartnerSafeMoment {
  momentId: string;
  labels: MomentLabel[];
  reflectionSummary: string;
  repairIntent: string;
}

export interface PartnerSafeReview {
  date: string;
  whoWith: string;
  stressProxyNotice: string;
  patterns: string[];
  suggestedRepairAction: string;
  dailyInsight: string;
  moments: PartnerSafeMoment[];
  createdAt: string;
}

export interface DailyReview {
  date: string;
  whoWith: string;
  reflections: DailyReflection[];
  summary: DailySummary;
  partnerSafe: PartnerSafeReview;
  updatedAt: string;
}

export interface ConversationPrompt {
  speaker: "Me" | "Partner";
  prompt: string;
}

export interface SharedSession {
  generatedAt: string;
  myPerspective: string;
  theirPerspective: string;
  frictionPoints: string[];
  repairPlan: string[];
  conversationScript: ConversationPrompt[];
  safetyNote: string;
}
