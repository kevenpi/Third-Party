"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { PartnerSafeReview, SharedSession } from "@shared/types";
import { Sparkles, Heart, Compass } from "lucide-react";

async function readTextFile(file: File): Promise<string> {
  return file.text();
}

export default function SessionPage() {
  const [myReviewText, setMyReviewText] = useState("");
  const [partnerReviewText, setPartnerReviewText] = useState("");
  const [session, setSession] = useState<SharedSession | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSessionContext() {
      setContextLoading(true);
      const response = await fetch("/api/sessionContext");
      const payload = await response.json();
      if (!active || !response.ok) {
        if (active) {
          setError(payload.error || "Could not load session context.");
          setContextLoading(false);
        }
        return;
      }
      setMyReviewText(JSON.stringify(payload.myReview, null, 2));
      setPartnerReviewText(JSON.stringify(payload.partnerReview, null, 2));
      setContextLoading(false);
    }

    loadSessionContext();
    return () => {
      active = false;
    };
  }, []);

  async function onPartnerFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPartnerReviewText(await readTextFile(file));
  }

  async function generateSession() {
    setError("");
    setLoading(true);

    try {
      const myReview = JSON.parse(myReviewText) as PartnerSafeReview;
      const partnerReview = JSON.parse(partnerReviewText) as PartnerSafeReview;

      const response = await fetch("/api/generateSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myReview, partnerReview })
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not generate session.");
        return;
      }

      setSession(payload.session);
    } catch {
      setError("Review JSON is invalid. Please paste a valid partner-safe review JSON.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-16 py-12 fade-in-section">
      <header className="text-center space-y-6">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#E5989B]/10">
          <Heart className="w-10 h-10 text-[#E5989B]/60" />
        </div>
        <div className="space-y-2">
          <h2 className="text-5xl font-light serif italic">The Bridge Builder</h2>
          <p className="text-[#2E2A25]/40 text-lg italic">Returning to understanding through shared breath.</p>
        </div>
      </header>

      <div className="soft-card p-12 md:p-16 space-y-12 relative overflow-hidden">
        {/* Warm glow behind content */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E5989B]/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="flex items-center gap-4 border-b border-[#E5989B]/10 pb-6">
          <Compass className="w-4 h-4 text-[#E5989B]" />
          <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-[#E5989B]/50">Shared Session Builder</span>
        </div>

        <p className="text-[#2E2A25]/60 leading-relaxed italic">
          Build a partner-safe therapy conversation using both perspectives. Raw audio and raw transcript text are never shared.
        </p>
        
        {contextLoading ? (
          <p className="text-[#2E2A25]/40 italic">Preparing both perspectives...</p>
        ) : null}

        <div className="tp-grid tp-grid-2 space-y-6">
          <div className="tp-field">
            <label className="text-sm font-medium text-[#2E2A25]/70">My perspective (partner-safe JSON)</label>
            <textarea
              className="tp-textarea"
              value={myReviewText}
              onChange={(event) => setMyReviewText(event.target.value)}
              placeholder="Auto-filled from your latest recap."
            />
          </div>

          <div className="tp-field">
            <label className="text-sm font-medium text-[#2E2A25]/70">Partner perspective (partner-safe JSON)</label>
            <textarea
              className="tp-textarea"
              value={partnerReviewText}
              onChange={(event) => setPartnerReviewText(event.target.value)}
              placeholder="Auto-filled demo partner perspective."
            />
            <input 
              type="file" 
              accept=".json,application/json" 
              onChange={onPartnerFileChange}
              className="mt-2 text-sm text-[#2E2A25]/60"
            />
          </div>
        </div>

        <div className="pt-6">
          <button
            type="button"
            className="w-full py-6 bg-[#E5989B] text-white font-bold rounded-full transition-all hover:bg-[#B5838D] disabled:opacity-50 flex items-center justify-center gap-4 text-xs tracking-[0.3em] uppercase shadow-lg shadow-[#E5989B]/20"
            onClick={generateSession}
            disabled={contextLoading || loading || !myReviewText || !partnerReviewText}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Listening deeply...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Seek Shared Wisdom
              </>
            )}
          </button>
          {error ? <p className="tp-error mt-4 text-sm">{error}</p> : null}
        </div>
      </div>

      {session ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
          <Card>
            <div className="flex items-center gap-3 text-[#E5989B] mb-4">
              <Heart className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-[0.4em]">My Perspective</span>
            </div>
            <p className="text-lg leading-relaxed text-[#2E2A25]/70 serif italic border-l-2 border-[#E5989B]/20 pl-8">
              {session.myPerspective}
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-3 text-[#E5989B] mb-4">
              <Heart className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-[0.4em]">Their Perspective</span>
            </div>
            <p className="text-lg leading-relaxed text-[#2E2A25]/70 serif italic border-l-2 border-[#E5989B]/20 pl-8">
              {session.theirPerspective}
            </p>
          </Card>

          <Card>
            <h3 className="serif italic text-2xl mb-4" style={{ marginTop: 0 }}>Friction Points</h3>
            <ul className="space-y-3">
              {session.frictionPoints.map((item, idx) => (
                <li key={`friction-${idx}`} className="text-[#2E2A25]/70 leading-relaxed border-l-2 border-[#E5989B]/20 pl-6">
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="serif italic text-2xl mb-4" style={{ marginTop: 0 }}>Repair Plan</h3>
            <ul className="space-y-3">
              {session.repairPlan.map((item, idx) => (
                <li key={`repair-${idx}`} className="text-[#2E2A25]/70 leading-relaxed border-l-2 border-[#E5989B]/20 pl-6">
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="serif italic text-2xl mb-4" style={{ marginTop: 0 }}>Conversation Script</h3>
            <ol className="space-y-4">
              {session.conversationScript.map((entry, idx) => (
                <li key={`prompt-${idx}`} className="text-[#2E2A25]/70 leading-relaxed">
                  <span className="font-bold text-[#E5989B] serif italic">{entry.speaker}:</span>{" "}
                  <span className="serif italic">{entry.prompt}</span>
                </li>
              ))}
            </ol>
            <p className="tp-muted text-sm italic mt-6" style={{ marginBottom: 0 }}>
              {session.safetyNote}
            </p>
          </Card>
        </div>
      ) : null}
      
      <div className="text-center">
        <p className="text-xs italic text-[#2E2A25]/30">This space is sacred and private to you both.</p>
      </div>
    </div>
  );
}
