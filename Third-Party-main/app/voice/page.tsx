"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mic, Upload, ArrowLeft, Loader2, User, Users, Edit2, Check, X } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

const VOICE_STORAGE_KEY = "thirdparty_enrolled_speakers";

function SpeakerRow({
  speaker,
  editingSpeakerId,
  editingName,
  setEditingSpeakerId,
  setEditingName,
  onSave,
}: {
  speaker: { id: string; display_name: string | null };
  editingSpeakerId: string | null;
  editingName: string;
  setEditingSpeakerId: (id: string | null) => void;
  setEditingName: (n: string) => void;
  onSave: (id: string, name: string) => Promise<void>;
}) {
  const [convoIds, setConvoIds] = useState<string[] | null>(null);
  const isEditing = editingSpeakerId === speaker.id;
  const display = speaker.display_name || `Speaker ${speaker.id.slice(0, 8)}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/voice/conversations/by-speaker?speakerId=${encodeURIComponent(speaker.id)}`);
        const d = await r.json();
        if (!cancelled && r.ok && Array.isArray(d.conversationIds)) setConvoIds(d.conversationIds);
      } catch {
        if (!cancelled) setConvoIds([]);
      }
    })();
    return () => { cancelled = true; };
  }, [speaker.id]);

  return (
    <li className="flex flex-col gap-2 p-3 rounded-lg bg-[#1E1B18] border border-[rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between gap-2">
        {isEditing ? (
          <>
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="Name"
              className="flex-1 px-2 py-1 rounded bg-[#12110F] text-[rgba(255,255,255,0.9)] text-sm border border-[rgba(255,255,255,0.2)]"
              autoFocus
            />
            <button
              onClick={() => onSave(speaker.id, editingName)}
              className="p-1.5 rounded text-[#7AB89E] hover:bg-[#7AB89E]/20"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setEditingSpeakerId(null); setEditingName(""); }}
              className="p-1.5 rounded text-[rgba(255,255,255,0.5)] hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-[#D4B07A]">{display}</span>
            <button
              onClick={() => { setEditingSpeakerId(speaker.id); setEditingName(speaker.display_name || ""); }}
              className="p-1.5 rounded text-[rgba(255,255,255,0.5)] hover:bg-white/10"
              title="Edit name"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      {convoIds !== null && (
        <p className="text-xs text-[rgba(255,255,255,0.5)]">
          {convoIds.length} conversation{convoIds.length !== 1 ? "s" : ""}
        </p>
      )}
    </li>
  );
}

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

export default function VoicePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"upload" | "record">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    segments: { speakerTag: number; text: string; identifiedPersonId?: string | null; confidence?: string | null }[];
    fullTranscript?: string;
    speakerCount?: number;
    identification?: Record<string, { profileId: string; personId: string; confidence: string }>;
    error?: string;
  } | null>(null);
  const [identifySpeakers, setIdentifySpeakers] = useState(true);
  const [useOpenAIPipeline, setUseOpenAIPipeline] = useState(true); // OpenAI diarize + speaker clustering
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [speakers, setSpeakers] = useState<{ id: string; display_name: string | null; last_seen_at?: string }[]>([]);
  const [embedderStatus, setEmbedderStatus] = useState<{ configured: boolean; ok: boolean; model?: string } | null>(null);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const enrolled = getEnrolledSpeakers();

  const loadSpeakers = async () => {
    try {
      const r = await fetch("/api/voice/speakers");
      const d = await r.json();
      if (r.ok && Array.isArray(d.speakers)) setSpeakers(d.speakers);
    } catch {
      /* ignore */
    }
  };
  const loadEmbedderStatus = async () => {
    try {
      const r = await fetch("/api/voice/embedder-status");
      const d = await r.json();
      setEmbedderStatus(d);
    } catch {
      setEmbedderStatus({ configured: false, ok: false });
    }
  };
  useEffect(() => {
    loadSpeakers();
    loadEmbedderStatus();
  }, []);

  const saveSpeakerName = async (speakerId: string, display_name: string) => {
    try {
      const r = await fetch("/api/voice/speakers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerId, display_name: display_name.trim() || "" }),
      });
      if (r.ok) {
        setEditingSpeakerId(null);
        setEditingName("");
        await loadSpeakers();
      }
    } catch {
      /* ignore */
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordingBlob(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
      };
      recorder.start();
    } catch (e) {
      console.error(e);
      setResult({ segments: [], error: "Microphone access denied or unavailable." });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const getAudioForRequest = (): File | Blob | null => {
    if (file) return file;
    if (recordingBlob) return recordingBlob;
    return null;
  };

  const runProcess = async () => {
    const audio = getAudioForRequest();
    if (!audio) {
      setResult({ segments: [], error: "Please upload a file or record audio first." });
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      if (useOpenAIPipeline) {
        const form = new FormData();
        form.append("audio", audio, file?.name || "recording.webm");
        const res = await fetch("/api/voice/processOpenAI", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          setResult({ segments: [], error: data.error || "Request failed" });
          return;
        }
        const segs = (data.segments ?? []).map((s: { text: string; speaker_display_name?: string | null; speaker_global_id?: string | null }) => ({
          speakerTag: 0,
          text: s.text,
          identifiedPersonId: s.speaker_display_name ?? s.speaker_global_id ?? null,
          confidence: null,
        }));
        setResult({
          segments: segs,
          fullTranscript: segs.map((s: { text: string }) => s.text).join(" "),
          speakerCount: data.speakers?.length ?? 0,
        });
        await loadSpeakers();
        return;
      }

      const form = new FormData();
      form.append("audio", audio, file?.name || "recording.webm");
      form.append("minSpeakerCount", "1");
      form.append("maxSpeakerCount", "6");
      if (identifySpeakers && enrolled.length > 0) {
        form.append(
          "enrolledSpeakers",
          JSON.stringify(enrolled.map((e) => ({ profileId: e.profileId, personId: e.personId })))
        );
      }

      const url = identifySpeakers && enrolled.length > 0 ? "/api/voice/process" : "/api/voice/transcribe";
      const res = await fetch(url, { method: "POST", body: form });

      const data = await res.json();
      if (!res.ok) {
        setResult({ segments: [], error: data.error || "Request failed" });
        return;
      }

      if (data.segments) {
        setResult({
          segments: data.segments,
          fullTranscript: data.fullTranscript,
          speakerCount: data.speakerCount,
          identification: data.identification,
        });
      } else {
        setResult({
          segments: data.segments || [],
          fullTranscript: data.fullTranscript,
          speakerCount: data.speakerCount ?? 0,
        });
      }
    } catch (e) {
      setResult({
        segments: [],
        error: e instanceof Error ? e.message : "Network or server error",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#12110F] pb-24">
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-[rgba(255,255,255,0.9)]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-normal" style={{ fontFamily: "Fraunces, serif" }}>
            Voice → Transcript &amp; Speakers
          </h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <p className="text-sm text-[rgba(255,255,255,0.6)]">
          Upload or record. Use OpenAI for diarization + speaker memory (clustering), or Google + Azure for enrolled-only identification.
        </p>

        <label className="flex items-center gap-3 warm-card cursor-pointer">
          <input
            type="checkbox"
            checked={useOpenAIPipeline}
            onChange={(e) => setUseOpenAIPipeline(e.target.checked)}
            className="rounded border-[rgba(255,255,255,0.3)]"
          />
          <span className="text-sm text-[rgba(255,255,255,0.9)]">
            OpenAI + speaker memory (diarize then cluster voices across sessions)
          </span>
        </label>

        {/* Mode toggle */}
        <div className="flex rounded-xl bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] p-1">
          <button
            onClick={() => setMode("upload")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
              mode === "upload" ? "bg-[#D4B07A]/20 text-[#D4B07A]" : "text-[rgba(255,255,255,0.5)]"
            }`}
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
          <button
            onClick={() => setMode("record")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
              mode === "record" ? "bg-[#D4B07A]/20 text-[#D4B07A]" : "text-[rgba(255,255,255,0.5)]"
            }`}
          >
            <Mic className="w-4 h-4" /> Record
          </button>
        </div>

        {mode === "upload" && (
          <div className="warm-card">
            <input
              type="file"
              accept="audio/*,.wav,.webm,.mp3,.flac"
              className="block w-full text-sm text-[rgba(255,255,255,0.7)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#D4B07A]/20 file:text-[#D4B07A]"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setRecordingBlob(null);
                setResult(null);
              }}
            />
            <p className="text-xs text-[rgba(255,255,255,0.4)] mt-2">
              WAV (16 kHz, 16-bit, mono) works best for speaker identification.
            </p>
          </div>
        )}

        {mode === "record" && (
          <div className="warm-card flex flex-col items-center gap-4">
            {!recordingBlob ? (
              <>
                <button
                  onClick={startRecording}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4B07A] to-[#E8C97A] text-[#12110F] flex items-center justify-center shadow-lg hover:scale-105 transition-all"
                >
                  <Mic className="w-8 h-8" />
                </button>
                <p className="text-sm text-[rgba(255,255,255,0.5)]">Tap to start recording</p>
              </>
            ) : (
              <>
                <p className="text-sm text-[#7AB89E]">Recording ready. You can process it or record again.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRecordingBlob(null); setFile(null); setResult(null); }}
                    className="px-4 py-2 rounded-lg border border-[rgba(255,255,255,0.2)] text-sm text-[rgba(255,255,255,0.8)]"
                  >
                    Record again
                  </button>
                  <button
                    onClick={stopRecording}
                    className="px-4 py-2 rounded-lg bg-[#1E1B18] text-sm text-[rgba(255,255,255,0.5)]"
                  >
                    Stop
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {!useOpenAIPipeline && enrolled.length > 0 && (
          <label className="flex items-center gap-3 warm-card cursor-pointer">
            <input
              type="checkbox"
              checked={identifySpeakers}
              onChange={(e) => setIdentifySpeakers(e.target.checked)}
              className="rounded border-[rgba(255,255,255,0.3)]"
            />
            <span className="text-sm text-[rgba(255,255,255,0.9)]">
              Identify speakers using enrolled voices ({enrolled.length} enrolled)
            </span>
          </label>
        )}

        <button
          onClick={runProcess}
          disabled={processing || (!file && !recordingBlob)}
          className="w-full py-4 px-6 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-2xl font-medium shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Processing…
            </>
          ) : (
            "Transcribe & identify"
          )}
        </button>

        {result?.error && (
          <div className="warm-card border-[rgba(185,74,58,0.3)]">
            <p className="text-sm text-[#B84A3A]">{result.error}</p>
          </div>
        )}

        {result && !result.error && result.segments.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72]">
              Transcript by speaker {result.speakerCount != null && `(${result.speakerCount} speakers)`}
            </p>
            <div className="space-y-3">
              {result.segments.map((seg, i) => (
                <div key={i} className="warm-card">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-[#D4B07A]/80" />
                    <span className="text-sm font-medium text-[#D4B07A]">
                      {seg.identifiedPersonId ? seg.identifiedPersonId : `Speaker ${seg.speakerTag}`}
                      {seg.confidence != null && (
                        <span className="text-[rgba(255,255,255,0.4)] ml-2">({Number(seg.confidence).toFixed(2)})</span>
                      )}
                    </span>
                  </div>
                  <p className="text-[rgba(255,255,255,0.9)] leading-relaxed">{seg.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {useOpenAIPipeline && (speakers.length > 0 || embedderStatus) && (
          <div className="warm-card space-y-4">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] flex items-center gap-2">
              <Users className="w-4 h-4" /> Speakers &amp; conversations
            </p>
            {embedderStatus && (
              <p className="text-xs text-[rgba(255,255,255,0.5)]">
                Voice ID: {embedderStatus.configured && embedderStatus.ok
                  ? `ECAPA-TDNN (${embedderStatus.model ?? "active"})`
                  : embedderStatus.configured
                    ? "Service unreachable (using placeholder)"
                    : "Placeholder (set SPEAKER_EMBEDDER_URL for real IDs)"}
              </p>
            )}
            {speakers.length > 0 && (
              <ul className="space-y-3">
                {speakers.map((s) => (
                  <SpeakerRow
                    key={s.id}
                    speaker={s}
                    editingSpeakerId={editingSpeakerId}
                    editingName={editingName}
                    setEditingSpeakerId={setEditingSpeakerId}
                    setEditingName={setEditingName}
                    onSave={saveSpeakerName}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-[rgba(255,255,255,0.06)]">
          <p className="text-xs text-[rgba(255,255,255,0.4)]">
            Enroll voices in People → open a person → &quot;Enroll voice&quot; so they can be identified in future transcripts.
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
