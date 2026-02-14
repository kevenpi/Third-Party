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

export type AwarenessSource = "microphone" | "meta_glasses" | "phone_camera";

export interface SpeakerHint {
  personTag: string;
  speakingScore: number;
}

export interface AwarenessSignalEvent {
  source: AwarenessSource;
  timestamp: string;
  audioLevel: number;
  presenceScore?: number;
  transcriptText?: string;
  transcriptWords?: number;
  transcriptConfidence?: number;
  speakerHints: SpeakerHint[];
  deviceId?: string;
}

export interface SpeakerWindow {
  personTag: string;
  score: number;
}

export interface RecordingSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  createdBy: "detector" | "manual";
  speakerWindows: SpeakerWindow[];
  clipPaths: string[];
  evidence?: {
    samples: number;
    legibleFrames: number;
    transcriptWords: number;
    transcriptConfidenceSum: number;
  };
}

export interface ConversationAwarenessState {
  listeningEnabled: boolean;
  isRecording: boolean;
  lastUpdatedAt: string;
  activeSessionId?: string;
  activeSpeakers: SpeakerWindow[];
  rollingAudioLevels: number[];
  recentSignals: AwarenessSignalEvent[];
  latestAction:
    | "idle"
    | "awaiting_conversation"
    | "start_recording"
    | "continue_recording"
    | "stop_recording";
}

export interface MetaGlassesSignalPayload {
  deviceId: string;
  timestamp?: string;
  audioLevel?: number;
  speakerHints?: SpeakerHint[];
}
