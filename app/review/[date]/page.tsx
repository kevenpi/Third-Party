"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/Card";
import { Stepper } from "@/components/Stepper";
import { AnalyzedDay, DailyReflection, DailyReview } from "@shared/types";

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ReviewPage() {
  const params = useParams<{ date: string }>();

  const date = params.date;
  const [requestedMoment, setRequestedMoment] = useState<string | null>(null);

  const [day, setDay] = useState<AnalyzedDay | null>(null);
  const [review, setReview] = useState<DailyReview | null>(null);
  const [reflections, setReflections] = useState<DailyReflection[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError("");

      const [dayResponse, reviewResponse] = await Promise.all([
        fetch(`/api/day?date=${date}`),
        fetch(`/api/review?date=${date}`)
      ]);

      const dayPayload = await dayResponse.json();
      const reviewPayload = await reviewResponse.json();

      if (!active) {
        return;
      }

      if (!dayResponse.ok) {
        setLoadError(dayPayload.error || "Could not load day.");
        setLoading(false);
        return;
      }

      if (!reviewResponse.ok) {
        setLoadError(reviewPayload.error || "Could not load review draft.");
        setLoading(false);
        return;
      }

      setDay(dayPayload.day);
      setReview(reviewPayload.review);
      setReflections(reviewPayload.review.reflections);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [date]);

  const moments = useMemo(() => day?.moments.filter((moment) => !moment.ignored) ?? [], [day]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedMoment(params.get("moment"));
  }, []);

  useEffect(() => {
    if (!requestedMoment || moments.length === 0) {
      return;
    }
    const idx = moments.findIndex((moment) => moment.id === requestedMoment);
    if (idx >= 0) {
      setCurrentIndex(idx);
    }
  }, [moments, requestedMoment]);

  const currentMoment = moments[currentIndex] ?? null;

  const currentPromptSet = useMemo(() => {
    if (!day || !currentMoment) {
      return null;
    }
    return day.promptSets.find((set) => set.momentId === currentMoment.id) ?? null;
  }, [currentMoment, day]);

  const currentReflection = useMemo(() => {
    if (!currentMoment) {
      return null;
    }
    return reflections.find((entry) => entry.momentId === currentMoment.id) ?? null;
  }, [currentMoment, reflections]);

  function upsertReflection(momentId: string, mutator: (entry: DailyReflection) => DailyReflection) {
    setReflections((previous) => {
      const index = previous.findIndex((entry) => entry.momentId === momentId);
      if (index >= 0) {
        const clone = [...previous];
        clone[index] = mutator(clone[index]);
        return clone;
      }
      const nextEntry = mutator({ momentId, isImportant: true, answers: ["", "", ""] });
      return [...previous, nextEntry];
    });
  }

  function updateAnswer(answerIndex: 0 | 1 | 2, value: string) {
    if (!currentMoment) {
      return;
    }
    upsertReflection(currentMoment.id, (entry) => {
      const answers = [...entry.answers] as [string, string, string];
      answers[answerIndex] = value;
      return { ...entry, answers };
    });
  }

  function updateImportance(value: boolean) {
    if (!currentMoment) {
      return;
    }
    upsertReflection(currentMoment.id, (entry) => ({ ...entry, isImportant: value }));
  }

  async function saveReview(): Promise<DailyReview | null> {
    setSaving(true);
    setStatus("");
    setActionError("");

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          reflections
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload.error || "Could not save review.");
        return null;
      }

      setReview(payload.review);
      setReflections(payload.review.reflections);
      setStatus("Review saved.");
      return payload.review as DailyReview;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save review.";
      setActionError(message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function exportPartnerSafe() {
    const saved = await saveReview();
    const usable = saved ?? review;
    if (!usable) {
      return;
    }

    downloadJson(`thirdparty_partner_safe_${usable.date}.json`, usable.partnerSafe);
  }

  if (loading) {
    return <p className="tp-muted">Loading review...</p>;
  }

  if (loadError) {
    return <p className="tp-error">{loadError}</p>;
  }

  if (!day || moments.length === 0 || !currentMoment) {
    return (
      <Card>
        <p>No moments are marked as important for this date yet.</p>
      </Card>
    );
  }

  const answers = currentReflection?.answers ?? ["", "", ""];
  const prompts = currentPromptSet?.prompts ?? [
    "What feeling was strongest here?",
    "What pattern do you notice?",
    "What repair action can you try next?"
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-12 py-12 fade-in-section">
      <header className="text-center space-y-4">
        <h1 className="text-5xl font-light serif italic">Guided Review</h1>
        <p className="text-[#2E2A25]/60 text-lg italic">
          {day.date} with {day.whoWith}. Move slowly and answer each prompt in your own words.
        </p>
      </header>

      <div className="soft-card p-8 space-y-4">
        <p className="text-[10px] uppercase tracking-[0.5em] text-[#E5989B] font-bold">Daily Insight</p>
        <p className="text-xl leading-relaxed serif italic text-[#2E2A25]/80" style={{ marginBottom: 0 }}>
          {day.summary.dailyInsight}
        </p>
      </div>

      <Card className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E5989B]/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="relative">
          <Stepper current={currentIndex + 1} total={moments.length} />

          <p className="text-[10px] uppercase tracking-[0.4em] text-[#E5989B]/50 font-bold mb-4">
            Moment {currentIndex + 1} of {moments.length}
          </p>
          
          <div className="space-y-6 mb-8">
            <p className="text-2xl leading-relaxed serif italic text-[#2E2A25]/80 border-l-2 border-[#E5989B]/20 pl-8">
              "{currentMoment.shortQuote}"
            </p>
            <p className="text-[#2E2A25]/60 leading-relaxed">{currentMoment.text}</p>
          </div>

          <div className="space-y-6">
            <div className="tp-field">
              <label className="text-sm font-medium text-[#2E2A25]/70">{prompts[0]}</label>
              <textarea
                className="tp-textarea"
                value={answers[0]}
                onChange={(event) => updateAnswer(0, event.target.value)}
              />
            </div>

            <div className="tp-field">
              <label className="text-sm font-medium text-[#2E2A25]/70">{prompts[1]}</label>
              <textarea
                className="tp-textarea"
                value={answers[1]}
                onChange={(event) => updateAnswer(1, event.target.value)}
              />
            </div>

            <div className="tp-field">
              <label className="text-sm font-medium text-[#2E2A25]/70">{prompts[2]}</label>
              <textarea
                className="tp-textarea"
                value={answers[2]}
                onChange={(event) => updateAnswer(2, event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-8">
            <button
              type="button"
              className="tp-btn"
              onClick={() => updateImportance(!(currentReflection?.isImportant ?? true))}
            >
              {currentReflection?.isImportant ?? true
                ? "Mark as Not Important"
                : "Mark as Important"}
            </button>
          </div>

          <div className="flex flex-wrap gap-4 mt-6">
            <button
              type="button"
              className="tp-btn"
              onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
              disabled={currentIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="tp-btn"
              onClick={() => setCurrentIndex((index) => Math.min(index + 1, moments.length - 1))}
              disabled={currentIndex === moments.length - 1}
            >
              Next
            </button>
            <button
              type="button"
              className="tp-btn tp-btn-primary"
              onClick={saveReview}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Review"}
            </button>
            <button type="button" className="tp-btn" onClick={exportPartnerSafe} disabled={saving}>
              Export partner-safe JSON
            </button>
          </div>

          {status ? <p className="tp-success mt-4 text-sm">{status}</p> : null}
          {actionError ? <p className="tp-error mt-4 text-sm">{actionError}</p> : null}
        </div>
      </Card>
    </div>
  );
}
