import { z } from "zod";
import { MOMENT_LABELS } from "@shared/types";

export const MomentLabelSchema = z.enum(MOMENT_LABELS);

export const SpikeWindowSchema = z
  .object({
    id: z.string().min(1),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    peak: z.number().min(0).max(1).optional()
  })
  .refine((val) => val.endSec > val.startSec, {
    message: "endSec must be greater than startSec"
  });

export const MomentSchema = z
  .object({
    id: z.string().min(1),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    text: z.string().min(1),
    shortQuote: z.string().min(1).max(220),
    labels: z.array(MomentLabelSchema).min(1),
    stressAligned: z.boolean(),
    stressWindowId: z.string().optional(),
    ignored: z.boolean().optional()
  })
  .refine((val) => val.endSec >= val.startSec, {
    message: "Moment endSec must be >= startSec"
  });

export const MomentPromptSetSchema = z.object({
  momentId: z.string().min(1),
  prompts: z.tuple([
    z.string().min(4),
    z.string().min(4),
    z.string().min(4)
  ])
});

export const DailySummarySchema = z.object({
  patterns: z.array(z.string().min(4)).min(1),
  suggestedRepairAction: z.string().min(4),
  dailyInsight: z.string().min(12)
});

export const AnalyzedDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  whoWith: z.string().min(1),
  stressProxyNotice: z.string().min(8),
  transcript: z.string().min(8),
  spikes: z.array(SpikeWindowSchema),
  moments: z.array(MomentSchema).min(1),
  promptSets: z.array(MomentPromptSetSchema).min(1),
  summary: DailySummarySchema,
  createdAt: z.string().datetime()
});

export const DailyReflectionSchema = z.object({
  momentId: z.string().min(1),
  isImportant: z.boolean(),
  answers: z.tuple([
    z.string().max(1000),
    z.string().max(1000),
    z.string().max(1000)
  ])
});

export const PartnerSafeMomentSchema = z.object({
  momentId: z.string().min(1),
  labels: z.array(MomentLabelSchema).min(1),
  reflectionSummary: z.string().min(8),
  repairIntent: z.string().min(8)
});

export const PartnerSafeReviewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  whoWith: z.string().min(1),
  stressProxyNotice: z.string().min(8),
  patterns: z.array(z.string().min(4)).min(1),
  suggestedRepairAction: z.string().min(4),
  dailyInsight: z.string().min(8),
  moments: z.array(PartnerSafeMomentSchema),
  createdAt: z.string().datetime()
});

export const DailyReviewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  whoWith: z.string().min(1),
  reflections: z.array(DailyReflectionSchema),
  summary: DailySummarySchema,
  partnerSafe: PartnerSafeReviewSchema,
  updatedAt: z.string().datetime()
});

export const ConversationPromptSchema = z.object({
  speaker: z.enum(["Me", "Partner"]),
  prompt: z.string().min(6)
});

export const SharedSessionSchema = z
  .object({
    generatedAt: z.string().datetime(),
    myPerspective: z.string().min(10),
    theirPerspective: z.string().min(10),
    frictionPoints: z.array(z.string().min(6)).min(1),
    repairPlan: z.array(z.string().min(6)).min(1),
    conversationScript: z.array(ConversationPromptSchema).length(6),
    safetyNote: z.string().min(12)
  })
  .refine(
    (value) =>
      value.conversationScript.filter((entry) => entry.speaker === "Me").length ===
        3 &&
      value.conversationScript.filter((entry) => entry.speaker === "Partner").length ===
        3,
    {
      message: "Conversation script must have 3 prompts for each speaker"
    }
  );

export const SegmentOutputSchema = z.object({
  moments: z
    .array(
      z.object({
        id: z.string().min(1),
        startSec: z.number().nonnegative(),
        endSec: z.number().nonnegative(),
        text: z.string().min(1),
        shortQuote: z.string().min(1).max(220)
      })
    )
    .min(1)
});

export const LabelOutputSchema = z.object({
  moments: z
    .array(
      z.object({
        id: z.string().min(1),
        labels: z.array(MomentLabelSchema).min(1),
        stressAligned: z.boolean(),
        stressWindowId: z.string().optional()
      })
    )
    .min(1)
});

export const PromptSummaryOutputSchema = z.object({
  promptSets: z.array(MomentPromptSetSchema).min(1),
  summary: DailySummarySchema
});

export const SpeakerHintSchema = z.object({
  personTag: z.string().min(1),
  speakingScore: z.number().min(0).max(1)
});

export const AwarenessSignalEventSchema = z.object({
  source: z.enum(["microphone", "meta_glasses", "phone_camera"]),
  timestamp: z.string().datetime(),
  audioLevel: z.number().min(0).max(1),
  presenceScore: z.number().min(0).max(1).optional(),
  transcriptText: z.string().max(500).optional(),
  transcriptWords: z.number().int().min(0).max(200).optional(),
  transcriptConfidence: z.number().min(0).max(1).optional(),
  speakerHints: z.array(SpeakerHintSchema).max(8),
  deviceId: z.string().optional(),
  faceIdentification: z
    .object({
      personId: z.string().min(1),
      personName: z.string().min(1),
      confidence: z.enum(["high", "medium", "low"])
    })
    .optional()
});

export const AwarenessDebugEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  category: z.enum(["listener", "ingest", "decision", "recording", "pipeline"]),
  message: z.string().min(1).max(300),
  level: z.enum(["info", "warn", "error"]).optional(),
  sessionId: z.string().optional(),
  action: z
    .enum([
      "idle",
      "awaiting_conversation",
      "start_recording",
      "continue_recording",
      "stop_recording"
    ])
    .optional(),
  data: z
    .object({
      audioLevel: z.number().min(0).max(1).optional(),
      transcriptWords: z.number().int().min(0).max(200).optional(),
      transcriptConfidence: z.number().min(0).max(1).optional(),
      transcriptText: z.string().max(500).optional(),
      windowSamples: z.number().int().min(0).max(200).optional(),
      windowDurationSec: z.number().min(0).max(30).optional(),
      legibleFrames: z.number().int().min(0).max(200).optional(),
      distinctSpeakers: z.number().int().min(0).max(20).optional(),
      avgAudio: z.number().min(0).max(1).optional(),
      avgConfidence: z.number().min(0).max(1).optional(),
      words: z.number().int().min(0).max(10000).optional(),
      transcriptStrong: z.boolean().optional(),
      multiSpeakerStrong: z.boolean().optional(),
      audioSpeechBlend: z.boolean().optional(),
      verdict: z.boolean().optional(),
      reason: z.string().max(200).optional()
    })
    .optional()
});

export const SpeakerWindowSchema = z.object({
  personTag: z.string().min(1),
  score: z.number().min(0).max(1)
});

export const RecordingSessionSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  createdBy: z.enum(["detector", "manual"]),
  speakerWindows: z.array(SpeakerWindowSchema).max(24),
  clipPaths: z.array(z.string().min(1)).max(24),
  evidence: z
    .object({
      samples: z.number().int().min(0).max(100000),
      legibleFrames: z.number().int().min(0).max(100000),
      transcriptWords: z.number().int().min(0).max(100000),
      transcriptConfidenceSum: z.number().min(0).max(100000)
    })
    .optional()
});

export const ConversationAwarenessStateSchema = z.object({
  listeningEnabled: z.boolean(),
  isRecording: z.boolean(),
  lastUpdatedAt: z.string().datetime(),
  activeSessionId: z.string().optional(),
  activeSpeakers: z.array(SpeakerWindowSchema).max(8),
  rollingAudioLevels: z.array(z.number().min(0).max(1)).max(20),
  recentSignals: z.array(AwarenessSignalEventSchema).max(20),
  startCandidateCount: z.number().int().min(0).max(20).default(0),
  stopCandidateCount: z.number().int().min(0).max(20).default(0),
  latestAction: z.enum([
    "idle",
    "awaiting_conversation",
    "start_recording",
    "continue_recording",
    "stop_recording"
  ])
});

export const AwarenessControlSchema = z.object({
  listeningEnabled: z.boolean()
});

export const IngestSignalRequestSchema = z.object({
  source: z.enum(["microphone", "meta_glasses", "phone_camera"]),
  timestamp: z.string().datetime().optional(),
  audioLevel: z.number().min(0).max(1).optional(),
  presenceScore: z.number().min(0).max(1).optional(),
  transcriptText: z.string().max(500).optional(),
  transcriptWords: z.number().int().min(0).max(200).optional(),
  transcriptConfidence: z.number().min(0).max(1).optional(),
  speakerHints: z.array(SpeakerHintSchema).optional(),
  deviceId: z.string().optional(),
  faceIdentification: z
    .object({
      personId: z.string().min(1),
      personName: z.string().min(1),
      confidence: z.enum(["high", "medium", "low"])
    })
    .optional()
});

export const MetaGlassesSignalPayloadSchema = z.object({
  deviceId: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  audioLevel: z.number().min(0).max(1).optional(),
  speakerHints: z.array(SpeakerHintSchema).optional()
});

export const UploadRecordedClipSchema = z.object({
  sessionId: z.string().min(1),
  audioBase64: z.string().min(8),
  mimeType: z.string().min(3).default("audio/webm")
});
