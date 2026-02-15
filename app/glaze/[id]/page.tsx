"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, MoreVertical, Mic, Camera, Loader2 } from "lucide-react";

const VOICE_STORAGE_KEY = "thirdparty_enrolled_speakers";
const VOICE_PROFILE_KEY = (id: string) => `thirdparty_voice_profile_${id}`;

function getEnrolledSpeakers(): { profileId: string; personId: string; name?: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VOICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setEnrolledSpeakers(list: { profileId: string; personId: string; name?: string }[]) {
  localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(list));
}

// ---------------------------------------------------------------------------
// Hardcoded fallback data (used when API has no data for this person)
// ---------------------------------------------------------------------------

interface Insight { text: string; color: string; }
interface ConvEntry { date: string; color: string; size: "small" | "medium" | "large"; id?: string; sessionId?: string; time?: string; durationMin?: number; dateFormatted?: string; }
interface GlazeData { name: string; description: string; stats: string; colorBand: string[]; insights: Insight[]; conversations: ConvEntry[]; photoCount: number; isEnrolled: boolean; avatarUrl?: string | null; }

// Insights generated per-person from seeded/real timeline data
const PERSON_INSIGHTS: Record<string, Insight[]> = {
  arthur: [
    { text: "Morning conversations are the calmest; stress patterns emerge most often after 6 PM.", color: "#6AAAB4" },
    { text: "When tension rises, you tend to speak faster and hold the floor longer.", color: "#B84A3A" },
    { text: "Repair language appears within 10-15 minutes of stress peaks — this is a strong pattern.", color: "#7AB89E" },
  ],
  tane: [
    { text: "Tane conversations are shortest in the morning and longest after work.", color: "#6AAAB4" },
    { text: "Scheduling mix-ups trigger stress spikes, but repair language appears within minutes.", color: "#B84A3A" },
    { text: "Shared humor is your most reliable de-escalation pattern with Tane.", color: "#7AB89E" },
  ],
  kevin: [
    { text: "Kevin interactions are most productive when you summarize action items before ending.", color: "#D4B07A" },
    { text: "Late-afternoon conversations show the highest chance of defensive tone.", color: "#B84A3A" },
    { text: "When you reflect back his point first, the conversation stays collaborative.", color: "#7AB89E" },
  ],
  jessica: [
    { text: "Jessica uses humor to redirect when conversations approach real preferences. Your body relaxes briefly but the underlying tension stays unresolved.", color: "#D4B07A" },
    { text: "You tend to concede during planning conversations with Jessica rather than naming what you actually want. Your HR rises when you say 'whatever works.'", color: "#D4806A" },
    { text: "Your calmest moments with Jessica happen when the conversation is unstructured - no agenda, no decisions to make.", color: "#7AB89E" },
  ],
};

// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getBubbleSize(size: "small" | "medium" | "large"): string {
  switch (size) {
    case "small": return "w-6 h-6";
    case "medium": return "w-8 h-8";
    case "large": return "w-10 h-10";
  }
}

export default function GlazePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const personId = params.id as string;
  const [glaze, setGlaze] = useState<GlazeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"recent" | "significant" | "stressful">("recent");

  // Voice enrollment
  const [enrollFile, setEnrollFile] = useState<File | null>(null);
  const [enrollRecording, setEnrollRecording] = useState<Blob | null>(null);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [savedProfileId, setSavedProfileId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Face enrollment
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [faceEnrolling, setFaceEnrolling] = useState(false);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceCameraRef = useRef<MediaStream | null>(null);

  // Fetch profile from API (data is seeded on first load)
  useEffect(() => {
    fetch(`/api/people/${personId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          const p = data.profile;
          setGlaze({
            name: p.name,
            description: p.description,
            stats: p.stats,
            colorBand: p.colorBand,
            insights: PERSON_INSIGHTS[personId] ?? [
              { text: `You have had ${p.conversations.length} recorded conversations with ${p.name}.`, color: "#C4B496" },
            ],
            conversations: p.conversations,
            photoCount: p.photoCount,
            isEnrolled: p.isEnrolled,
            avatarUrl: p.avatarUrl ?? null,
          });
        } else {
          setGlaze(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setGlaze(null);
        setLoading(false);
      });
  }, [personId]);

  useEffect(() => {
    try {
      setSavedProfileId(localStorage.getItem(VOICE_PROFILE_KEY(personId)));
    } catch {
      setSavedProfileId(null);
    }
  }, [personId]);

  // ------------------------------------------------------------------
  // Voice enrollment
  // ------------------------------------------------------------------

  const startEnrollRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setEnrollRecording(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
      };
      recorder.start();
      setEnrollMessage(null);
    } catch {
      setEnrollMessage({ type: "error", text: "Microphone access denied." });
    }
  };

  const stopEnrollRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const runEnroll = async () => {
    const audio = enrollFile || enrollRecording;
    if (!audio || !glaze) {
      setEnrollMessage({ type: "error", text: "Record or upload audio first." });
      return;
    }
    setEnrollLoading(true);
    setEnrollMessage(null);
    try {
      const form = new FormData();
      form.append("audio", audio, "enroll.webm");
      form.append("personId", personId);
      const profiles = getEnrolledSpeakers();
      const existing = profiles.find((p) => p.personId === personId);
      if (existing?.profileId) form.append("profileId", existing.profileId);
      const res = await fetch("/api/voice/enroll", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const profileId: string = data.profileId ?? existing?.profileId ?? "";
      if (profileId) {
        localStorage.setItem(VOICE_PROFILE_KEY(personId), profileId);
        setSavedProfileId(profileId);
        const list = profiles.filter((e) => e.personId !== personId);
        setEnrolledSpeakers([...list, { profileId, personId, name: glaze.name }]);
      }
      setEnrollMessage({ type: "ok", text: `Voice enrolled. (${data.enrollmentStatus ?? "Enrolled"})` });
      setEnrollFile(null);
      setEnrollRecording(null);
    } catch (e) {
      setEnrollMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setEnrollLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Face enrollment
  // ------------------------------------------------------------------

  const openFaceEnroll = useCallback(async () => {
    setShowFaceEnroll(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      faceCameraRef.current = stream;
      setTimeout(() => {
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          void faceVideoRef.current.play();
        }
      }, 100);
    } catch { /* camera unavailable */ }
  }, []);

  const closeFaceEnroll = useCallback(() => {
    setShowFaceEnroll(false);
    if (faceCameraRef.current) {
      faceCameraRef.current.getTracks().forEach((t) => t.stop());
      faceCameraRef.current = null;
    }
  }, []);

  const captureFace = useCallback(async () => {
    if (!glaze) return;
    const video = faceVideoRef.current;
    const canvas = faceCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    setFaceEnrolling(true);
    canvas.width = Math.min(512, video.videoWidth);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) { setFaceEnrolling(false); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const imageBase64 = dataUrl.split(",")[1] ?? "";
    try {
      await fetch("/api/face/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, name: glaze.name, imageBase64 }),
      });
      setGlaze((prev) =>
        prev
          ? {
              ...prev,
              photoCount: prev.photoCount + 1,
              isEnrolled: true,
              avatarUrl: `/api/people/${encodeURIComponent(personId)}/avatar?v=${Date.now()}`,
            }
          : prev
      );
      closeFaceEnroll();
    } catch { /* ignore */ }
    finally { setFaceEnrolling(false); }
  }, [glaze, personId, closeFaceEnroll]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#12110F]">
        <p className="text-[rgba(255,255,255,0.7)]">Loading...</p>
      </div>
    );
  }

  if (!glaze) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#12110F]">
        <p className="text-[rgba(255,255,255,0.7)]">Person not found</p>
      </div>
    );
  }

  const getInitials = (name: string): string =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const oldestDate = glaze.conversations[glaze.conversations.length - 1]?.date || "";

  return (
    <div className="min-h-screen bg-[#12110F] pb-20">
      {/* Navigation Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-[rgba(255,255,255,0.9)]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-normal" style={{ fontFamily: "Fraunces, serif" }}>{glaze.name}</h2>
          <button className="p-2 -mr-2 text-[rgba(255,255,255,0.5)]">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        {/* Person Header */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full mx-auto overflow-hidden">
            {glaze.avatarUrl ? (
              <img src={glaze.avatarUrl} alt={glaze.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4] flex items-center justify-center text-[#12110F] text-2xl font-semibold">
                {getInitials(glaze.name)}
              </div>
            )}
          </div>
          <h1 className="text-3xl font-normal text-[rgba(255,255,255,0.95)]" style={{ fontFamily: "Fraunces, serif" }}>
            {glaze.name}
          </h1>
          <p className="text-[rgba(255,255,255,0.8)] leading-relaxed px-4" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            {glaze.description}
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.4)]">{glaze.stats}</p>
          {glaze.isEnrolled && (
            <p className="text-xs text-[#D4B07A]">{glaze.photoCount} face photo{glaze.photoCount !== 1 ? "s" : ""} enrolled</p>
          )}
        </div>

        {/* Emotional Color Band */}
        <div className="space-y-2">
          <div className="h-8 rounded-lg overflow-hidden flex">
            {glaze.colorBand.map((color, idx) => (
              <div key={idx} style={{ backgroundColor: color, flex: 1 }} />
            ))}
          </div>
          <div className="flex justify-between text-xs text-[rgba(255,255,255,0.3)]">
            <span>{oldestDate ? formatDate(oldestDate) : ""}</span>
            <span>Today</span>
          </div>
        </div>

        {/* Face Enrollment */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Face for identification</p>
          <div className="warm-card space-y-3">
            {glaze.isEnrolled ? (
              <p className="text-sm text-[#7AB89E]">Face enrolled ({glaze.photoCount} photo{glaze.photoCount !== 1 ? "s" : ""}). Add more to improve accuracy.</p>
            ) : (
              <p className="text-sm text-[rgba(255,255,255,0.6)]">Enroll {glaze.name}&apos;s face so they can be identified automatically via the glasses camera.</p>
            )}
            <button
              onClick={openFaceEnroll}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D4B07A]/30 to-[#E8C97A]/30 text-[#D4B07A] font-medium flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> {glaze.isEnrolled ? "Add another photo" : "Enroll face"}
            </button>
          </div>
        </div>

        {/* Voice Enrollment */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Voice for identification</p>
          <div className="warm-card space-y-4">
            {savedProfileId ? (
              <p className="text-sm text-[#7AB89E]">Voice profile saved. Add more audio to improve recognition.</p>
            ) : (
              <p className="text-sm text-[rgba(255,255,255,0.6)]">Enroll {glaze.name}&apos;s voice so they can be identified in transcripts.</p>
            )}
            <input
              type="file"
              accept="audio/*,.wav"
              className="block w-full text-sm text-[rgba(255,255,255,0.7)] file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#D4B07A]/20 file:text-[#D4B07A]"
              onChange={(e) => {
                setEnrollFile(e.target.files?.[0] ?? null);
                setEnrollRecording(null);
                setEnrollMessage(null);
              }}
            />
            {!enrollRecording ? (
              <button type="button" onClick={startEnrollRecording} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.2)] text-sm text-[rgba(255,255,255,0.8)]">
                <Mic className="w-4 h-4" /> Record instead
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#7AB89E]">Recording ready</span>
                <button type="button" onClick={() => { setEnrollRecording(null); setEnrollMessage(null); }} className="text-xs text-[rgba(255,255,255,0.5)] underline">Clear</button>
              </div>
            )}
            <button
              onClick={runEnroll}
              disabled={enrollLoading || (!enrollFile && !enrollRecording)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D4B07A]/30 to-[#E8C97A]/30 text-[#D4B07A] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {enrollLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling...</> : "Enroll voice"}
            </button>
            {enrollMessage && (
              <p className={`text-sm ${enrollMessage.type === "ok" ? "text-[#7AB89E]" : "text-[#B84A3A]"}`}>{enrollMessage.text}</p>
            )}
          </div>
        </div>

        {/* AI Pattern Insights */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Patterns</p>
          <div className="space-y-3">
            {glaze.insights.map((insight, idx) => (
              <div key={idx} className="warm-card border-l-4" style={{ borderLeftColor: insight.color }}>
                <p className="text-[rgba(255,255,255,0.8)] leading-relaxed italic" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                  {insight.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">All Conversations</p>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "recent" | "significant" | "stressful")}
              className="bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-1 text-xs text-[rgba(255,255,255,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)]"
            >
              <option value="recent">Most recent</option>
              <option value="significant">Most significant</option>
              <option value="stressful">Most stressful</option>
            </select>
          </div>
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.06)]" />
            <div className="space-y-4">
              {glaze.conversations.map((conv, idx) => {
                const sizeClass = getBubbleSize(conv.size);
                const convId = conv.id ?? conv.sessionId ?? conv.date;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      try { sessionStorage.setItem(`conv-person-${convId}`, glaze.name); } catch {}
                      router.push(`/conversation/${convId}`);
                    }}
                    className="relative flex items-center gap-4 group w-full text-left"
                  >
                    <div
                      className={`${sizeClass} rounded-full -ml-8 transition-all group-hover:scale-125 z-10`}
                      style={{
                        backgroundColor: conv.color,
                        boxShadow: `0 0 8px ${conv.color}, inset 0 0 4px rgba(255, 255, 255, 0.1)`,
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-sm text-[rgba(255,255,255,0.5)]">
                        {conv.dateFormatted ?? formatDate(conv.date)}
                        {conv.time && <span className="ml-2 text-[rgba(255,255,255,0.3)]">{conv.time}</span>}
                      </p>
                      {conv.durationMin != null && (
                        <p className="text-xs text-[rgba(255,255,255,0.3)]">{Math.round(conv.durationMin)} min</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Face Enroll Modal */}
      {showFaceEnroll && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#1E1B18] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-lg font-normal text-[rgba(255,255,255,0.95)]" style={{ fontFamily: "Fraunces, serif" }}>
                Enroll {glaze.name}&apos;s Face
              </h2>
            </div>
            <div className="relative bg-black aspect-[4/3]">
              <video ref={faceVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={faceCanvasRef} className="hidden" />
            </div>
            <div className="p-4 flex gap-3">
              <button
                onClick={captureFace}
                disabled={faceEnrolling}
                className="flex-1 py-3 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-lg font-medium disabled:opacity-50"
              >
                {faceEnrolling ? "Enrolling..." : "Capture"}
              </button>
              <button onClick={closeFaceEnroll} className="px-6 py-3 border border-[rgba(255,255,255,0.06)] rounded-lg text-[rgba(255,255,255,0.5)]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
