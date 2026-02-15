"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Settings, Power } from "lucide-react";
import { getStressColor } from "@/lib/biometrics";

interface Conversation {
  id: string;
  time: string;
  person: string;
  durationSec: number;
  size: "small" | "medium" | "large";
  color: string;
  colorName: string;
  date: string;
}

interface LiveAwarenessState {
  listeningEnabled: boolean;
  isRecording: boolean;
  latestAction: string;
  activeSessionId?: string;
}

interface LiveAwarenessEvent {
  timestamp: string;
  audioLevel: number;
  transcriptWords?: number;
  transcriptConfidence?: number;
  transcriptText?: string;
  speakerHints?: Array<{
    personTag: string;
    speakingScore: number;
  }>;
}

interface LiveDebugEvent {
  id: string;
  timestamp: string;
  category: "listener" | "ingest" | "decision" | "recording" | "pipeline";
  message: string;
  level?: "info" | "warn" | "error";
  sessionId?: string;
  action?: string;
  data?: {
    audioLevel?: number;
    transcriptWords?: number;
    transcriptConfidence?: number;
    transcriptText?: string;
    windowSamples?: number;
    windowDurationSec?: number;
    legibleFrames?: number;
    distinctSpeakers?: number;
    avgAudio?: number;
    avgConfidence?: number;
    words?: number;
    transcriptStrong?: boolean;
    multiSpeakerStrong?: boolean;
    audioSpeechBlend?: boolean;
    verdict?: boolean;
    reason?: string;
    speakerLabel?: string;
    speakerConfidence?: number;
    diarizationBackend?: "openai" | "pyannote";
    segmentStartMs?: number;
    segmentEndMs?: number;
    conversationId?: string;
  };
}

function localDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getRecentDates(count: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(localDateStr(d));
  }
  return out;
}

function sortDatesTodayFirst(input: string[], todayStr: string): string[] {
  return [...new Set(input)].sort((a, b) => {
    if (a === todayStr && b !== todayStr) return -1;
    if (b === todayStr && a !== todayStr) return 1;
    return new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  });
}

function getBubbleSize(size: "small" | "medium" | "large"): string {
  switch (size) {
    case "small": return "w-12 h-12";
    case "medium": return "w-20 h-20";
    case "large": return "w-[120px] h-[120px]";
  }
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00"); // parse as local
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDateShort(dateStr: string): string {
  const todayStr = localDateStr(new Date());
  if (dateStr === todayStr) return "Today";
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (dateStr === localDateStr(yest)) return "Yesterday";
  // Parse as local date (add T00:00 to avoid UTC interpretation)
  const date = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeToMinutes(timeLabel: string): number {
  const parts = timeLabel.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
  if (!parts) return 0;
  let hour = parseInt(parts[1], 10) || 0;
  const min = parseInt(parts[2], 10) || 0;
  const period = (parts[3] || "").toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + min;
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function TimelinePage() {
  const router = useRouter();
  const today = localDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [dates, setDates] = useState<string[]>(() => getRecentDates(14));
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [appOn, setAppOn] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [liveState, setLiveState] = useState<LiveAwarenessState | null>(null);
  const [recentEvents, setRecentEvents] = useState<LiveAwarenessEvent[]>([]);
  const [debugEvents, setDebugEvents] = useState<LiveDebugEvent[]>([]);
  const [showLiveTranscript, setShowLiveTranscript] = useState(false);
  const dateScrollerRef = useRef<HTMLDivElement | null>(null);
  const [convTags, setConvTags] = useState<Record<string, string[]>>({});

  const loadBubbles = useCallback(async (date: string) => {
    try {
      const r = await fetch(`/api/timeline?date=${date}`);
      const data = await r.json();
      if (!r.ok) return;
      const bubbles = (data.bubbles ?? []).map((b: { id: string; time: string; person: string; durationSec?: number; durationMin: number; size: "small" | "medium" | "large"; color: string; colorName: string; date: string }) => ({
        id: b.id,
        time: b.time,
        person: b.person,
        durationSec: b.durationSec ?? Math.round((b.durationMin ?? 0) * 60),
        size: b.size,
        color: b.color,
        colorName: b.colorName,
        date: b.date,
      }));
      setConversations(bubbles);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBubbles(selectedDate);
  }, [selectedDate, loadBubbles]);

  useEffect(() => {
    if (selectedDate !== today) return;
    const id = setInterval(() => loadBubbles(today), 8000);
    return () => clearInterval(id);
  }, [selectedDate, today, loadBubbles]);

  useEffect(() => {
    fetch("/api/timeline?list=1")
      .then((r) => r.json())
      .then((data) => {
        const fromApi = (data.dates ?? []) as string[];
        const recent = getRecentDates(14);
        const merged = sortDatesTodayFirst([...recent, ...fromApi], today);
        setDates(merged.slice(0, 14));
      })
      .catch(() => {});
  }, [today]);

  useEffect(() => {
    const tagMap: Record<string, string[]> = {};
    for (const conv of conversations) {
      try {
        const raw = localStorage.getItem(`tags-${conv.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) tagMap[conv.id] = parsed;
        }
      } catch {}
    }
    setConvTags(tagMap);
  }, [conversations]);

  useEffect(() => {
    if (!dateScrollerRef.current) return;
    if (selectedDate === today) {
      dateScrollerRef.current.scrollLeft = 0;
      return;
    }
    // Scroll active pill into view
    const container = dateScrollerRef.current;
    const activeBtn = container.querySelector("[data-active-date]") as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [dates, selectedDate, today]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch("/api/conversationAwareness/state")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setAppOn(data?.state?.listeningEnabled === true);
          setLiveState(data?.state ?? null);
          setRecentEvents((data?.recentEvents ?? []) as LiveAwarenessEvent[]);
          setDebugEvents((data?.debugEvents ?? []) as LiveDebugEvent[]);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const toggleApp = useCallback(async () => {
    setToggleBusy(true);
    try {
      const next = !appOn;
      const r = await fetch("/api/conversationAwareness/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listeningEnabled: next }),
      });
      if (r.ok) setAppOn(next);
    } finally {
      setToggleBusy(false);
    }
  }, [appOn]);

  const orderedConversations = [...conversations].sort((a, b) => timeToMinutes(b.time) - timeToMinutes(a.time));
  const todayDisplay = formatDateDisplay(selectedDate);
  const isToday = selectedDate === today;
  const latestEvent = recentEvents.length > 0 ? recentEvents[0] : null;
  const transcriptStream = useMemo(
    () =>
      recentEvents
        .filter((event) => (event.transcriptText ?? "").trim().length > 0)
        .slice(0, 5),
    [recentEvents]
  );
  const liveSpeakerFeed = useMemo(
    () =>
      recentEvents
        .map((event) => ({
          timestamp: event.timestamp,
          transcriptText: event.transcriptText ?? "",
          speakerHints: [...(event.speakerHints ?? [])]
            .sort((a, b) => b.speakingScore - a.speakingScore)
            .slice(0, 2),
        }))
        .filter((event) => event.speakerHints.length > 0 || event.transcriptText.trim().length > 0)
        .slice(0, 8),
    [recentEvents]
  );
  const diarizationFeed = useMemo(
    () =>
      debugEvents
        .filter((event) => event.category === "pipeline" && !!event.data?.speakerLabel && !!event.data?.transcriptText)
        .slice(0, 12),
    [debugEvents]
  );
  const recentDebug = useMemo(
    () =>
      debugEvents
        .filter((event) => !(event.category === "pipeline" && !!event.data?.speakerLabel))
        .slice(0, 8),
    [debugEvents]
  );
  const liveCoherent = latestEvent
    ? latestEvent.audioLevel >= 0.05 && ((latestEvent.transcriptWords ?? 0) >= 2)
    : false;
  const hasLiveBubble =
    isToday &&
    !!(
      liveState?.isRecording ||
      liveState?.latestAction === "continue_recording" ||
      transcriptStream.length > 0
    );

  const handleBubbleClick = (conversation: Conversation) => {
    try { sessionStorage.setItem(`conv-person-${conversation.id}`, conversation.person); } catch {}
    router.push(`/conversation/${conversation.id}`);
  };

  return (
    <div className="min-h-screen bg-[#12110F] pb-20 relative">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)] overflow-hidden">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-normal" style={{ fontFamily: "Fraunces, serif" }}>Today</h1>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-0.5">{todayDisplay}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleApp}
              disabled={toggleBusy}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all ${
                appOn
                  ? "bg-[#7AB89E]/30 text-[#7AB89E] border border-[#7AB89E]/50"
                  : "bg-[#1E1B18] text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.1)]"
              }`}
            >
              <Power className="w-4 h-4" />
              {appOn ? "On" : "Off"}
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="p-2 text-[rgba(255,255,255,0.7)] hover:text-[rgba(255,255,255,0.9)]"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Selector */}
        <div className="relative pb-3 max-w-md mx-auto">
          <div
            ref={dateScrollerRef}
            className="date-scroller px-4 overflow-x-auto flex gap-2 flex-nowrap scroll-smooth"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <style>{`.date-scroller::-webkit-scrollbar { display: none; }`}</style>
            {dates.map((date) => {
              const isSelected = date === selectedDate;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  {...(isSelected ? { "data-active-date": true } : {})}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    isSelected
                      ? "bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F]"
                      : "bg-[#1E1B18] text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.7)] border border-[rgba(255,255,255,0.06)]"
                  }`}
                >
                  {formatDateShort(date)}
                </button>
              );
            })}
          </div>
          {/* Right fade hint */}
          <div className="absolute right-0 top-0 bottom-3 w-8 pointer-events-none" style={{ background: "linear-gradient(to right, transparent, #12110F)" }} />
        </div>
      </div>

      {/* Daily Summary */}
      {conversations.length > 0 && (
        <div className="max-w-md mx-auto px-4 pt-4">
          <div
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: '14px 18px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.7)',
                marginBottom: 4,
                fontFamily: 'Fraunces, serif',
              }}
            >
              Your Day
            </p>
            <p
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.4)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                lineHeight: 1.5,
              }}
            >
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} · {Math.round(conversations.reduce((s, c) => s + c.durationSec, 0) / 60)} min total
              {(() => {
                const stressConvs = conversations.filter(c => c.colorName === "stress-red");
                return stressConvs.length > 0
                  ? ` · ${stressConvs.length} stress moment${stressConvs.length !== 1 ? 's' : ''}`
                  : '';
              })()}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="max-w-md mx-auto px-4 py-8 relative">
        {hasLiveBubble && (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => setShowLiveTranscript((v) => !v)}
              className="w-full rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] p-3 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full ${liveState?.isRecording ? "animate-pulse" : ""}`}
                    style={{
                      backgroundColor: liveState?.isRecording ? "#EF4444" : "#D4B07A",
                      boxShadow: liveState?.isRecording
                        ? "0 0 14px #EF4444, 0 0 26px rgba(239,68,68,0.7)"
                        : "0 0 10px #D4B07A",
                    }}
                  />
                  <p className="text-xs uppercase tracking-wider text-[rgba(255,255,255,0.72)]">
                    {liveState?.isRecording ? "Live conversation bubble" : "Live transcript bubble"}
                  </p>
                </div>
                <span className="text-[10px] text-[rgba(255,255,255,0.52)]">
                  {showLiveTranscript ? "Hide" : "Open"}
                </span>
              </div>
              <p className="mt-2 text-sm text-[rgba(255,255,255,0.86)] line-clamp-2">
                {latestEvent?.transcriptText?.trim()
                  ? latestEvent.transcriptText
                  : liveState?.isRecording
                    ? "Listening for live transcript..."
                    : "Finalizing recording and deciding if this qualifies as a conversation."}
              </p>
            </button>
            {showLiveTranscript && (
              <div className="mt-2 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.16)] p-3">
                <p className="text-[11px] uppercase tracking-wider text-[rgba(255,255,255,0.54)] mb-2">
                  Live transcription
                </p>
                {transcriptStream.length === 0 ? (
                  <p className="text-xs text-[rgba(255,255,255,0.45)]">No transcript chunks yet</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-auto pr-1">
                    {transcriptStream.map((event) => (
                      <div key={event.timestamp} className="text-xs text-[rgba(255,255,255,0.74)] bg-[rgba(255,255,255,0.03)] rounded px-2 py-1.5">
                        <span className="text-[rgba(255,255,255,0.45)] mr-2">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        {event.transcriptText}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh]">
            <p className="text-[rgba(255,255,255,0.5)]">Loading…</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div 
              className="w-24 h-24 rounded-full pulse-glow"
              style={{ 
                backgroundColor: "#D4B07A",
                color: "#D4B07A",
                boxShadow: "0 0 30px #D4B07A, 0 0 60px #D4B07A, inset 0 0 20px rgba(255, 255, 255, 0.1)"
              }}
            />
            <p className="text-[rgba(255,255,255,0.7)] text-center">Your day is just beginning</p>
          </div>
        ) : (
          <div className="relative">
            {/* Thread Line */}
            <div className="thread-line" />

            {/* Timeline Start Label */}
            <div className="relative mb-8 text-center">
              <p className="text-xs text-[rgba(255,255,255,0.3)] italic">Most recent</p>
            </div>

            {/* Conversation Bubbles */}
            <div className="space-y-16">
              {orderedConversations.map((conv, index) => {
                const sizeClass = getBubbleSize(conv.size);
                const isLeft = index % 2 === 0;
                const isMostRecent = index === 0;

                return (
                  <div key={conv.id} className="relative flex items-center min-h-[80px]">
                    {/* Left Label */}
                    {isLeft && (
                      <div className="absolute right-[calc(50%+60px)] text-right pr-4 w-[calc(50%-60px)]">
                        <p className="text-sm font-medium text-[rgba(255,255,255,0.95)] truncate">{conv.person}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.5)]">{conv.time}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.4)]">{formatDuration(conv.durationSec)}</p>
                        {convTags[conv.id] && (
                          <div className="flex flex-wrap gap-1 mt-1 justify-end">
                            {convTags[conv.id].map((t) => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.5)]">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bubble */}
                    <div className="absolute left-1/2 -translate-x-1/2 z-10">
                      {(() => {
                        const isStress = conv.colorName === "stress-red";
                        const stressRing = isStress
                          ? `0 0 20px ${conv.color}, 0 0 40px ${conv.color}, 0 0 8px rgba(212,128,106,0.6), inset 0 0 20px rgba(255, 255, 255, 0.1)`
                          : undefined;
                        return (
                          <button
                            onClick={() => handleBubbleClick(conv)}
                            className={`bubble ${sizeClass} cursor-pointer ${isMostRecent && isToday ? "pulse-glow" : ""}`}
                            style={{
                              backgroundColor: conv.color,
                              color: conv.color,
                              ...(stressRing ? { boxShadow: stressRing } : {}),
                            }}
                          />
                        );
                      })()}
                    </div>

                    {/* Right Label */}
                    {!isLeft && (
                      <div className="absolute left-[calc(50%+60px)] text-left pl-4 w-[calc(50%-60px)]">
                        <p className="text-sm font-medium text-[rgba(255,255,255,0.95)] truncate">{conv.person}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.5)]">{conv.time}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.4)]">{formatDuration(conv.durationSec)}</p>
                        {convTags[conv.id] && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {convTags[conv.id].map((t) => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.5)]">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Timeline End Label */}
            {conversations.length > 0 && (
              <div className="mt-12 relative text-center">
                <p className="text-xs text-[rgba(255,255,255,0.2)] italic">Start of your day</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
