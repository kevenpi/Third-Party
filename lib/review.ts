import {
  AnalyzedDay,
  DailyReflection,
  DailyReview,
  PartnerSafeMoment,
  PartnerSafeReview
} from "@shared/types";

function clampText(input: string, length: number): string {
  const clean = input.trim().replace(/\s+/g, " ");
  return clean.length <= length ? clean : `${clean.slice(0, length - 3)}...`;
}

function summarizeReflection(answers: [string, string, string]): string {
  const nonEmpty = answers.map((entry) => entry.trim()).filter(Boolean);
  if (nonEmpty.length === 0) {
    return "I still need to reflect on this moment.";
  }
  return clampText(nonEmpty.join(" "), 220);
}

function buildRepairIntent(answers: [string, string, string]): string {
  const third = answers[2]?.trim();
  if (third && third.length > 0) {
    return clampText(third, 180);
  }
  const first = answers[0]?.trim();
  if (first && first.length > 0) {
    return clampText(`Next step: ${first}`, 180);
  }
  return "Next step: pause and ask for clarity before reacting.";
}

export function buildDraftReflections(day: AnalyzedDay): DailyReflection[] {
  return day.promptSets.map((promptSet) => ({
    momentId: promptSet.momentId,
    isImportant: !day.moments.find((moment) => moment.id === promptSet.momentId)?.ignored,
    answers: ["", "", ""]
  }));
}

export function buildPartnerSafeReview(
  day: AnalyzedDay,
  reflections: DailyReflection[]
): PartnerSafeReview {
  const moments: PartnerSafeMoment[] = reflections
    .filter((reflection) => {
      const dayMoment = day.moments.find((entry) => entry.id === reflection.momentId);
      return reflection.isImportant && Boolean(dayMoment) && !dayMoment?.ignored;
    })
    .map((reflection) => {
      const moment = day.moments.find((entry) => entry.id === reflection.momentId);
      return {
        momentId: reflection.momentId,
        labels: moment?.labels ?? ["misunderstanding"],
        reflectionSummary: summarizeReflection(reflection.answers),
        repairIntent: buildRepairIntent(reflection.answers)
      };
    });

  return {
    date: day.date,
    whoWith: day.whoWith,
    stressProxyNotice: day.stressProxyNotice,
    patterns: day.summary.patterns,
    suggestedRepairAction: day.summary.suggestedRepairAction,
    dailyInsight: day.summary.dailyInsight,
    moments,
    createdAt: new Date().toISOString()
  };
}

export function buildDailyReview(day: AnalyzedDay, reflections: DailyReflection[]): DailyReview {
  const partnerSafe = buildPartnerSafeReview(day, reflections);

  return {
    date: day.date,
    whoWith: day.whoWith,
    reflections,
    summary: day.summary,
    partnerSafe,
    updatedAt: new Date().toISOString()
  };
}
