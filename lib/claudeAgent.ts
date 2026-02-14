import Anthropic from "@anthropic-ai/sdk";
import {
  AnalyzedDay,
  Moment,
  MomentLabel,
  MomentPromptSet,
  PartnerSafeReview,
  SharedSession,
  SpikeWindow
} from "@shared/types";
import { z } from "zod";
import {
  LabelOutputSchema,
  PromptSummaryOutputSchema,
  SegmentOutputSchema,
  SharedSessionSchema
} from "@/lib/schemas";

interface AnalyzePipelineInput {
  date: string;
  whoWith: string;
  transcript: string;
  spikes: SpikeWindow[];
}

const STRESS_NOTICE = "Stress spikes are a proxy signal and not a cortisol measurement.";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractTextFromMessage(response: any): string {
  return response.content
    .map((entry: { type?: string; text?: string }) => {
      if (entry.type === "text") {
        return entry.text;
      }
      return "";
    })
    .join("\n")
    .trim();
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  const starts = [firstBrace, firstBracket].filter((idx) => idx >= 0);
  const start = starts.length === 0 ? -1 : Math.min(...starts);
  const target = start >= 0 ? text.slice(start) : text;

  return JSON.parse(target);
}

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return null;
  }
  return new Anthropic({ apiKey: key });
}

async function runClaudeJson<T>(
  schema: z.ZodSchema<T>,
  systemPrompt: string,
  userPrompt: string
): Promise<T | null> {
  const client = getAnthropicClient();
  if (!client) {
    return null;
  }

  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";
  let currentPrompt = userPrompt;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const message = await client.messages.create({
      model,
      max_tokens: 2200,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content: currentPrompt }]
    });

    const text = extractTextFromMessage(message);
    try {
      const parsed = extractJson(text);
      const validated = schema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }

      currentPrompt = `${userPrompt}\n\nYour previous output failed validation: ${validated.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ")}\nReturn only valid JSON matching schema.`;
    } catch (error) {
      currentPrompt = `${userPrompt}\n\nYour previous output could not be parsed as JSON. Return only valid JSON matching schema.`;
      if (attempt === 1) {
        throw error;
      }
    }
  }

  return null;
}

function findLabelsFromText(text: string): MomentLabel[] {
  const lower = text.toLowerCase();
  const labels: MomentLabel[] = [];

  if (/always|never|fault|blame|wrong/.test(lower)) {
    labels.push("criticism");
  }
  if (/but you|not true|defend|i said/.test(lower)) {
    labels.push("defensiveness");
  }
  if (/sorry|understand|let's|can we|thank/.test(lower)) {
    labels.push("repair");
  }
  if (/love|care|appreciate|grateful/.test(lower)) {
    labels.push("affection");
  }
  if (/need space|boundary|not okay|limit/.test(lower)) {
    labels.push("boundary");
  }
  if (/what did you mean|confused|misread|misunderstood/.test(lower)) {
    labels.push("misunderstanding");
  }

  if (labels.length === 0) {
    labels.push("tension");
  }

  return labels;
}

function overlapsSpike(moment: { startSec: number; endSec: number }, spike: SpikeWindow): boolean {
  return moment.startSec < spike.endSec && moment.endSec > spike.startSec;
}

function buildPromptSet(moment: Moment): MomentPromptSet {
  const primaryLabel = moment.labels[0];
  const tonePrompt =
    primaryLabel === "repair"
      ? "What did you do that helped soften the moment?"
      : "What feeling was strongest for you in this moment?";

  const patternPrompt = "What pattern from past conversations showed up here?";
  const actionPrompt =
    "What is one specific repair step you can try in your next conversation?";

  return {
    momentId: moment.id,
    prompts: [tonePrompt, patternPrompt, actionPrompt]
  };
}

function buildSummaryFromMoments(moments: Moment[]) {
  const counts = new Map<MomentLabel, number>();
  moments.forEach((moment) => {
    moment.labels.forEach((label) => {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
  });

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ordered.slice(0, 3);

  const patterns =
    top.length > 0
      ? top.map(([label, count]) => `${label} appeared in ${count} moment${count > 1 ? "s" : ""}.`)
      : ["Conversation showed mixed signals with moments of strain and care."];

  const hasRepair = counts.get("repair") ?? 0;
  const suggestedRepairAction =
    hasRepair > 0
      ? "Name one moment that felt better and ask how to repeat it this week."
      : "Use a short pause, reflect what you heard, then ask one clarifying question.";

  const dailyInsight =
    hasRepair > 0
      ? "You both moved between stress and care. There is enough trust to practice repair with clear language and slower pacing."
      : "Stress rose before clarity. A slower start and direct naming of feelings can reduce escalation.";

  return {
    patterns,
    suggestedRepairAction,
    dailyInsight
  };
}

function mockSegmentTranscript(transcript: string, spikes: SpikeWindow[]) {
  const text = normalizeWhitespace(transcript);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    chunks.push(sentences.slice(i, i + 2).join(" "));
  }

  if (chunks.length === 0) {
    chunks.push(text);
  }

  const maxSpike = Math.max(0, ...spikes.map((spike) => spike.endSec));
  const estimatedDuration = Math.max(maxSpike, chunks.length * 40);

  return chunks.map((chunk, idx) => {
    const startSec = Math.round((idx / chunks.length) * estimatedDuration);
    const endSec = Math.round(((idx + 1) / chunks.length) * estimatedDuration);
    const shortQuote = chunk.length > 190 ? `${chunk.slice(0, 189)}...` : chunk;

    return {
      id: `moment-${idx + 1}`,
      startSec,
      endSec,
      text: chunk,
      shortQuote
    };
  });
}

async function runAgentSegmentation(
  transcript: string,
  spikes: SpikeWindow[]
): Promise<
  {
    id: string;
    startSec: number;
    endSec: number;
    text: string;
    shortQuote: string;
  }[]
> {
  const systemPrompt = `You are a relationship reflection coach that writes strict JSON only.
Segment transcript text into meaningful conversational moments.
Never return markdown or extra commentary.`;

  const userPrompt = `Create moment segments from this transcript.
Rules:
- 4 to 12 moments.
- Each moment has id, startSec, endSec, text, shortQuote.
- shortQuote max 220 chars.
- Times should roughly span the conversation.
Transcript:
${transcript}

Stress spikes for reference:
${JSON.stringify(spikes)}`;

  const result = await runClaudeJson(SegmentOutputSchema, systemPrompt, userPrompt);
  if (!result) {
    return mockSegmentTranscript(transcript, spikes);
  }

  return result.moments;
}

async function runAgentLabeling(
  moments: {
    id: string;
    startSec: number;
    endSec: number;
    text: string;
    shortQuote: string;
  }[],
  spikes: SpikeWindow[]
): Promise<
  {
    id: string;
    labels: MomentLabel[];
    stressAligned: boolean;
    stressWindowId?: string;
  }[]
> {
  const systemPrompt = `You are a relationship reflection coach that writes strict JSON only.
Label each moment with one or more labels from: tension, criticism, defensiveness, repair, affection, boundary, misunderstanding.
Mark stress alignment only if overlap is plausible with spike windows.
Never return markdown.`;

  const userPrompt = `Label these moments.
Moments:
${JSON.stringify(moments)}

Spikes:
${JSON.stringify(spikes)}

Output JSON with array moments containing id, labels, stressAligned, stressWindowId.`;

  const result = await runClaudeJson(LabelOutputSchema, systemPrompt, userPrompt);
  if (!result) {
    return moments.map((moment) => {
      const overlap = spikes.find((spike) => overlapsSpike(moment, spike));
      return {
        id: moment.id,
        labels: findLabelsFromText(moment.text),
        stressAligned: Boolean(overlap),
        stressWindowId: overlap?.id
      };
    });
  }

  return result.moments;
}

async function runAgentPromptsAndSummary(
  date: string,
  whoWith: string,
  moments: Moment[]
): Promise<{
  promptSets: MomentPromptSet[];
  summary: {
    patterns: string[];
    suggestedRepairAction: string;
    dailyInsight: string;
  };
}> {
  const systemPrompt = `You are a calm journaling coach that writes strict JSON only.
Create specific, nonjudgmental prompts and a daily summary.
Do not include clinical diagnosis.
Never return markdown.`;

  const userPrompt = `Date: ${date}
Who with: ${whoWith}
Moments:
${JSON.stringify(moments)}

Return JSON with:
- promptSets: [{momentId, prompts:[p1,p2,p3]}]
- summary: {patterns:string[], suggestedRepairAction:string, dailyInsight:string}`;

  const result = await runClaudeJson(PromptSummaryOutputSchema, systemPrompt, userPrompt);
  if (!result) {
    return {
      promptSets: moments.map((moment) => buildPromptSet(moment)),
      summary: buildSummaryFromMoments(moments)
    };
  }

  return result;
}

export async function transcribeAudioPlaceholder(audioBuffer: Buffer): Promise<string> {
  const secondsGuess = Math.max(20, Math.round(audioBuffer.byteLength / 12000));
  return `Audio clip uploaded. Placeholder transcription estimates about ${secondsGuess} seconds. Paste transcript text for higher quality moment extraction.`;
}

export async function analyzeDayWithAgent(input: AnalyzePipelineInput): Promise<AnalyzedDay> {
  const segmented = await runAgentSegmentation(input.transcript, input.spikes);
  const labeled = await runAgentLabeling(segmented, input.spikes);

  const mergedMoments: Moment[] = segmented.map((segment) => {
    const labelInfo = labeled.find((entry) => entry.id === segment.id);
    const overlap = input.spikes.find((spike) => overlapsSpike(segment, spike));

    return {
      id: segment.id,
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: normalizeWhitespace(segment.text),
      shortQuote: normalizeWhitespace(segment.shortQuote),
      labels:
        labelInfo && labelInfo.labels.length > 0
          ? labelInfo.labels
          : findLabelsFromText(segment.text),
      stressAligned: labelInfo?.stressAligned ?? Boolean(overlap),
      stressWindowId: labelInfo?.stressWindowId ?? overlap?.id,
      ignored: false
    };
  });

  const promptSummary = await runAgentPromptsAndSummary(
    input.date,
    input.whoWith,
    mergedMoments
  );

  const promptSets = mergedMoments.map((moment) => {
    const candidate = promptSummary.promptSets.find((entry) => entry.momentId === moment.id);
    return candidate ?? buildPromptSet(moment);
  });

  return {
    date: input.date,
    whoWith: input.whoWith,
    stressProxyNotice: STRESS_NOTICE,
    transcript: normalizeWhitespace(input.transcript),
    spikes: input.spikes,
    moments: mergedMoments,
    promptSets,
    summary: promptSummary.summary,
    createdAt: new Date().toISOString()
  };
}

function buildFallbackSession(
  myReview: PartnerSafeReview,
  partnerReview: PartnerSafeReview
): SharedSession {
  const frictionPoints = [
    myReview.patterns[0] ?? "Stress rises before both people feel heard.",
    partnerReview.patterns[0] ?? "Both people want care but react quickly when tense."
  ];

  return {
    generatedAt: new Date().toISOString(),
    myPerspective: myReview.dailyInsight,
    theirPerspective: partnerReview.dailyInsight,
    frictionPoints,
    repairPlan: [
      "Start with one feeling and one need before discussing facts.",
      "Use short paraphrases to confirm understanding.",
      "End with one specific repair commitment for tomorrow."
    ],
    conversationScript: [
      {
        speaker: "Me",
        prompt: "What part of this week felt hardest for you in our connection?"
      },
      {
        speaker: "Partner",
        prompt: "What did you most need from me in that moment?"
      },
      {
        speaker: "Me",
        prompt: "What pattern do you notice in how I respond under stress?"
      },
      {
        speaker: "Partner",
        prompt: "What pattern do you notice in how you respond under stress?"
      },
      {
        speaker: "Me",
        prompt: "What one repair step should we test in our next conversation?"
      },
      {
        speaker: "Partner",
        prompt: "What would help you feel safer and more understood next time?"
      }
    ],
    safetyNote:
      "This shared session is a coaching reflection tool. It is not medical diagnosis or clinical therapy."
  };
}

export async function generateSharedSessionWithAgent(
  myReview: PartnerSafeReview,
  partnerReview: PartnerSafeReview
): Promise<SharedSession> {
  const systemPrompt = `You are a calm relationship reflection coach.
Write strict JSON only. No markdown.
Use only partner-safe summaries.
Do not quote raw transcripts.
Return exactly 6 conversation prompts with 3 from Me and 3 from Partner.`;

  const userPrompt = `Build a shared session from two partner-safe daily reviews.
My review:
${JSON.stringify(myReview)}
Partner review:
${JSON.stringify(partnerReview)}

Output JSON matching this shape:
{
  "generatedAt": "ISO date",
  "myPerspective": "string",
  "theirPerspective": "string",
  "frictionPoints": ["string"],
  "repairPlan": ["string"],
  "conversationScript": [
    {"speaker": "Me", "prompt": "string"},
    {"speaker": "Partner", "prompt": "string"}
  ],
  "safetyNote": "string"
}`;

  const result = await runClaudeJson(SharedSessionSchema, systemPrompt, userPrompt);
  if (!result) {
    return buildFallbackSession(myReview, partnerReview);
  }

  return result;
}
