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
