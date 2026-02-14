"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SpeakerWindow {
  personTag: string;
  score: number;
}

interface AwarenessState {
  listeningEnabled: boolean;
  isRecording: boolean;
  lastUpdatedAt: string;
  activeSessionId?: string;
  activeSpeakers: SpeakerWindow[];
  rollingAudioLevels: number[];
  latestAction:
    | "idle"
    | "awaiting_conversation"
    | "start_recording"
    | "continue_recording"
    | "stop_recording";
}

interface AwarenessEvent {
  source: "microphone" | "meta_glasses" | "phone_camera";
  timestamp: string;
  audioLevel: number;
  presenceScore?: number;
  speakerHints: Array<{ personTag: string; speakingScore: number }>;
  deviceId?: string;
}

interface RecordingSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  speakerWindows: SpeakerWindow[];
  clipPaths: string[];
}

interface AwarenessSnapshot {
  state: AwarenessState;
  sessions: RecordingSession[];
  recentEvents: AwarenessEvent[];
}

const EMPTY_SNAPSHOT: AwarenessSnapshot = {
  state: {
    listeningEnabled: false,
    isRecording: false,
    lastUpdatedAt: new Date(0).toISOString(),
    activeSessionId: undefined,
    activeSpeakers: [],
    rollingAudioLevels: [],
    latestAction: "idle"
  },
  sessions: [],
  recentEvents: []
};

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function buildSpeakerHints(myTag: string, score: number) {
  const cleanTag = myTag.trim();
  if (!cleanTag) {
    return [];
  }

  return [{ personTag: cleanTag, speakingScore: score }];
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      const [, base64] = result.split(",");
      if (!base64) {
        reject(new Error("Failed to encode audio blob"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read audio blob"));
    reader.readAsDataURL(blob);
  });
}

export default function SettingsPage() {
  const [snapshot, setSnapshot] = useState<AwarenessSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [monitorActive, setMonitorActive] = useState(false);
  const [cameraMonitorActive, setCameraMonitorActive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [mySpeakerTag, setMySpeakerTag] = useState("Me");
  const [metaDeviceId, setMetaDeviceId] = useState("meta-rayban-demo");
  const [metaSpeakerA, setMetaSpeakerA] = useState("Me");
  const [metaSpeakerB, setMetaSpeakerB] = useState("Partner");
  const [metaSpeakerAScore, setMetaSpeakerAScore] = useState(0.62);
  const [metaSpeakerBScore, setMetaSpeakerBScore] = useState(0.55);
  const [metaAudioLevel, setMetaAudioLevel] = useState(0.56);
  const [cameraSpeakerTag, setCameraSpeakerTag] = useState("Partner");
  const [cameraMotionScore, setCameraMotionScore] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const monitorIntervalRef = useRef<number | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const cameraIntervalRef = useRef<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const recorderMimeTypeRef = useRef<string>("audio/webm");
  const activeSessionIdRef = useRef<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/api/conversationAwareness/state");
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not load awareness state.");
        return;
      }
      setSnapshot(payload);
      activeSessionIdRef.current = payload.state.activeSessionId ?? null;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load awareness state.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const poll = window.setInterval(() => {
      void loadSnapshot();
    }, 5000);

    return () => {
      window.clearInterval(poll);
    };
  }, [loadSnapshot]);

  const stopBrowserRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    if (recorder.state === "recording") {
      recorder.stop();
      return;
    }

    recorderRef.current = null;
  }, []);

  const stopMicMonitoring = useCallback(() => {
    if (monitorIntervalRef.current !== null) {
      window.clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }

    stopBrowserRecording();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setMonitorActive(false);
  }, [stopBrowserRecording]);

  const stopCameraMonitoring = useCallback(() => {
    if (cameraIntervalRef.current !== null) {
      window.clearInterval(cameraIntervalRef.current);
      cameraIntervalRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.srcObject = null;
      cameraVideoRef.current = null;
    }

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    previousFrameRef.current = null;
    setCameraMonitorActive(false);
    setCameraMotionScore(0);
  }, []);

  const stopMonitoring = useCallback(() => {
    stopMicMonitoring();
    stopCameraMonitoring();
  }, [stopCameraMonitoring, stopMicMonitoring]);

  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  const uploadRecording = useCallback(async (sessionId: string) => {
    if (recorderChunksRef.current.length === 0) {
      return;
    }

    const mimeType = recorderMimeTypeRef.current || "audio/webm";
    const blob = new Blob(recorderChunksRef.current, { type: mimeType });
    recorderChunksRef.current = [];

    try {
      const audioBase64 = await toBase64(blob);
      const response = await fetch("/api/conversationAwareness/uploadClip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          audioBase64,
          mimeType
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not upload recorded clip.");
        return;
      }

      setNotice(`Clip uploaded to session ${payload.session.id}.`);
      await loadSnapshot();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Could not upload recorded clip.";
      setError(message);
    }
  }, [loadSnapshot]);

  const beginBrowserRecording = useCallback(
    (sessionId: string) => {
      if (!streamRef.current) {
        return;
      }

      const existing = recorderRef.current;
      if (existing && existing.state === "recording") {
        return;
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(streamRef.current, { mimeType: "audio/webm" });
      } catch {
        recorder = new MediaRecorder(streamRef.current);
      }
      recorderChunksRef.current = [];
      activeSessionIdRef.current = sessionId;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          recorderChunksRef.current.push(event.data);
        }
      };

      recorderMimeTypeRef.current = recorder.mimeType || "audio/webm";

      recorder.onstop = () => {
        const activeSessionId = activeSessionIdRef.current;
        if (!activeSessionId) {
          recorderChunksRef.current = [];
          recorderRef.current = null;
          return;
        }

        void uploadRecording(activeSessionId);
        recorderRef.current = null;
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setNotice(`Recording started for ${sessionId}.`);
    },
    [uploadRecording]
  );

  const applyDetectorState = useCallback(
    (state: AwarenessState, sessionId?: string | null) => {
      const resolvedSessionId = sessionId ?? state.activeSessionId ?? null;

      if (state.isRecording && resolvedSessionId) {
        beginBrowserRecording(resolvedSessionId);
      } else {
        stopBrowserRecording();
      }
    },
    [beginBrowserRecording, stopBrowserRecording]
  );

  const computeAudioLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return 0;
    }

    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);

    let sum = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      const normalized = (buffer[index] - 128) / 128;
      sum += normalized * normalized;
    }

    return Math.min(1, Math.sqrt(sum / buffer.length) * 2.6);
  }, []);

  const ingestMicSignal = useCallback(async () => {
    try {
      const audioLevel = computeAudioLevel();
      const response = await fetch("/api/conversationAwareness/ingestSignal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "microphone",
          audioLevel,
          speakerHints: buildSpeakerHints(mySpeakerTag, Math.min(1, audioLevel + 0.25))
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not ingest microphone signal.");
        return;
      }

      setSnapshot((previous) => ({
        ...previous,
        state: payload.state,
        sessions: payload.session
          ? [payload.session, ...previous.sessions.filter((item) => item.id !== payload.session.id)]
          : previous.sessions,
        recentEvents: previous.recentEvents
      }));

      applyDetectorState(payload.state, payload.session?.id);
      activeSessionIdRef.current = payload.state.activeSessionId ?? payload.session?.id ?? null;
    } catch (ingestError) {
      const message = ingestError instanceof Error ? ingestError.message : "Could not ingest microphone signal.";
      setError(message);
    }
  }, [applyDetectorState, computeAudioLevel, mySpeakerTag]);

  const computeCameraMotion = useCallback((): number => {
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    if (!video || !canvas) {
      return 0;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return 0;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const current = new Uint8ClampedArray(canvas.width * canvas.height);

    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
      const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      current[pixel] = luminance;
    }

    const previous = previousFrameRef.current;
    previousFrameRef.current = current;

    if (!previous || previous.length !== current.length) {
      return 0;
    }

    let diffSum = 0;
    for (let i = 0; i < current.length; i += 1) {
      diffSum += Math.abs(current[i] - previous[i]);
    }

    const normalized = diffSum / (current.length * 255);
    return Math.min(1, normalized * 7);
  }, []);

  const ingestCameraSignal = useCallback(async () => {
    try {
      const presenceScore = computeCameraMotion();
      setCameraMotionScore(presenceScore);

      const response = await fetch("/api/conversationAwareness/ingestSignal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "phone_camera",
          presenceScore,
          speakerHints: buildSpeakerHints(cameraSpeakerTag, Math.min(1, presenceScore + 0.15))
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not ingest phone camera signal.");
        return;
      }

      setSnapshot((previous) => ({
        ...previous,
        state: payload.state,
        sessions: payload.session
          ? [payload.session, ...previous.sessions.filter((item) => item.id !== payload.session.id)]
          : previous.sessions,
        recentEvents: previous.recentEvents
      }));

      applyDetectorState(payload.state, payload.session?.id);
      activeSessionIdRef.current = payload.state.activeSessionId ?? payload.session?.id ?? null;
    } catch (cameraError) {
      const message = cameraError instanceof Error ? cameraError.message : "Could not ingest phone camera signal.";
      setError(message);
    }
  }, [applyDetectorState, cameraSpeakerTag, computeCameraMotion]);

  const startMicMonitoring = useCallback(async () => {
    setError("");
    setNotice("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      monitorIntervalRef.current = window.setInterval(() => {
        void ingestMicSignal();
      }, 1200);

      setMonitorActive(true);
      setNotice("Microphone monitor active.");
    } catch (monitorError) {
      const message = monitorError instanceof Error ? monitorError.message : "Could not start microphone monitor.";
      setError(message);
    }
  }, [ingestMicSignal]);

  const startCameraMonitoring = useCallback(async () => {
    setError("");
    setNotice("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 320 },
          height: { ideal: 240 }
        }
      });

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 60;

      cameraStreamRef.current = stream;
      cameraVideoRef.current = video;
      cameraCanvasRef.current = canvas;
      previousFrameRef.current = null;

      cameraIntervalRef.current = window.setInterval(() => {
        void ingestCameraSignal();
      }, 1300);

      setCameraMonitorActive(true);
      setNotice(
        "Phone camera co-presence monitor active. No images are stored and no facial recognition is used."
      );
    } catch (cameraError) {
      const message = cameraError instanceof Error ? cameraError.message : "Could not start phone camera monitor.";
      setError(message);
    }
  }, [ingestCameraSignal]);

  const toggleListening = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const next = !snapshot.state.listeningEnabled;
      const response = await fetch("/api/conversationAwareness/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listeningEnabled: next })
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not update listening state.");
        return;
      }

      setSnapshot((previous) => ({ ...previous, state: payload.state }));

      if (next) {
        if (!monitorActive) {
          await startMicMonitoring();
        }
        if (!cameraMonitorActive) {
          await startCameraMonitoring();
        }
        setNotice("Conversation awareness listening is enabled.");
      } else {
        stopMonitoring();
        setNotice("Conversation awareness listening is disabled.");
      }
    } catch (toggleError) {
      const message = toggleError instanceof Error ? toggleError.message : "Could not update listening state.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [
    cameraMonitorActive,
    monitorActive,
    snapshot.state.listeningEnabled,
    startCameraMonitoring,
    startMicMonitoring,
    stopMonitoring
  ]);

  const sendMetaSignal = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const speakerHints = [
        { personTag: metaSpeakerA.trim(), speakingScore: Number(metaSpeakerAScore) },
        { personTag: metaSpeakerB.trim(), speakingScore: Number(metaSpeakerBScore) }
      ].filter((entry) => entry.personTag.length > 0);

      const response = await fetch("/api/metaGlasses/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: metaDeviceId,
          audioLevel: Number(metaAudioLevel),
          speakerHints
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Could not ingest Meta glasses signal.");
        return;
      }

      setSnapshot((previous) => ({
        ...previous,
        state: payload.state,
        sessions: payload.session
          ? [payload.session, ...previous.sessions.filter((item) => item.id !== payload.session.id)]
          : previous.sessions
      }));

      applyDetectorState(payload.state, payload.session?.id);
      setNotice("Meta glasses signal ingested.");
    } catch (metaError) {
      const message = metaError instanceof Error ? metaError.message : "Could not ingest Meta glasses signal.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [
    applyDetectorState,
    metaAudioLevel,
    metaDeviceId,
    metaSpeakerA,
    metaSpeakerAScore,
    metaSpeakerB,
    metaSpeakerBScore
  ]);

  const currentLevel = useMemo(() => {
    const levels = snapshot.state.rollingAudioLevels;
    if (levels.length === 0) {
      return 0;
    }
    return levels[levels.length - 1];
  }, [snapshot.state.rollingAudioLevels]);

  return (
    <div className="min-h-screen bg-[#12110F] pb-20 px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl text-[rgba(255,255,255,0.95)]" style={{ fontFamily: "Fraunces, serif" }}>
            Conversation Awareness
          </h1>
          <p className="text-[rgba(255,255,255,0.65)]">
            Detect live conversation, start recording automatically, and ingest Meta glasses speaker hints.
          </p>
          <p className="text-[rgba(255,255,255,0.5)] text-sm">
            Safety note: facial recognition is disabled. Speaker identity is based on consented person tags and speaking hints.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl border border-[#B84A3A]/40 bg-[#B84A3A]/10 px-4 py-3 text-[#F4CFC8] text-sm">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl border border-[#7AB89E]/40 bg-[#7AB89E]/10 px-4 py-3 text-[#CFE8DD] text-sm">
            {notice}
          </div>
        ) : null}

        <section className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[#1E1B18] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)]">Detector state</p>
              <p className="text-[rgba(255,255,255,0.9)] text-lg">
                {snapshot.state.listeningEnabled ? "Listening" : "Idle"} | {snapshot.state.isRecording ? "Recording" : "Not recording"}
              </p>
              <p className="text-[rgba(255,255,255,0.5)] text-sm">
                Latest action: {snapshot.state.latestAction.replaceAll("_", " ")}
              </p>
            </div>
            <button
              onClick={toggleListening}
              disabled={busy || loading}
              className="px-5 py-3 rounded-full bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] font-medium disabled:opacity-60"
            >
              {snapshot.state.listeningEnabled ? "Stop listening" : "Start listening"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] p-3">
              <p className="text-[rgba(255,255,255,0.5)]">Mic monitor</p>
              <p className="text-[rgba(255,255,255,0.9)]">{monitorActive ? "Active" : "Stopped"}</p>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] p-3">
              <p className="text-[rgba(255,255,255,0.5)]">Camera monitor</p>
              <p className="text-[rgba(255,255,255,0.9)]">{cameraMonitorActive ? "Active" : "Stopped"}</p>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] p-3">
              <p className="text-[rgba(255,255,255,0.5)]">Current audio level</p>
              <p className="text-[rgba(255,255,255,0.9)]">{currentLevel.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] p-3">
              <p className="text-[rgba(255,255,255,0.5)]">Camera presence</p>
              <p className="text-[rgba(255,255,255,0.9)]">{cameraMotionScore.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] p-3">
              <p className="text-[rgba(255,255,255,0.5)]">Active session</p>
              <p className="text-[rgba(255,255,255,0.9)]">{snapshot.state.activeSessionId ?? "none"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">My speaker tag for microphone hints</label>
              <input
                value={mySpeakerTag}
                onChange={(event) => setMySpeakerTag(event.target.value)}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">Camera person tag hint</label>
              <input
                value={cameraSpeakerTag}
                onChange={(event) => setCameraSpeakerTag(event.target.value)}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={startCameraMonitoring}
              disabled={busy || cameraMonitorActive}
              className="px-4 py-2 rounded-full border border-[rgba(255,255,255,0.14)] text-[rgba(255,255,255,0.9)] hover:bg-white/5 disabled:opacity-60"
            >
              Start phone camera assist
            </button>
            <button
              onClick={stopCameraMonitoring}
              disabled={busy || !cameraMonitorActive}
              className="px-4 py-2 rounded-full border border-[rgba(255,255,255,0.14)] text-[rgba(255,255,255,0.9)] hover:bg-white/5 disabled:opacity-60"
            >
              Stop phone camera assist
            </button>
          </div>
          <p className="text-xs text-[rgba(255,255,255,0.45)]">
            Phone camera assist computes motion-based co-presence scores only. It does not identify faces or store frames.
          </p>
        </section>

        <section className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[#1E1B18] p-6 space-y-4">
          <h2 className="text-xl text-[rgba(255,255,255,0.92)]" style={{ fontFamily: "Fraunces, serif" }}>
            Meta glasses signal ingestion
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">Device ID</label>
              <input
                value={metaDeviceId}
                onChange={(event) => setMetaDeviceId(event.target.value)}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">Ambient audio level</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={metaAudioLevel}
                onChange={(event) => setMetaAudioLevel(Number(event.target.value))}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">Speaker A</label>
              <input
                value={metaSpeakerA}
                onChange={(event) => setMetaSpeakerA(event.target.value)}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">Speaker A score</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={metaSpeakerAScore}
                onChange={(event) => setMetaSpeakerAScore(Number(event.target.value))}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">Speaker B</label>
              <input
                value={metaSpeakerB}
                onChange={(event) => setMetaSpeakerB(event.target.value)}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-[rgba(255,255,255,0.6)]">Speaker B score</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={metaSpeakerBScore}
                onChange={(event) => setMetaSpeakerBScore(Number(event.target.value))}
                className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#12110F] px-3 py-2 text-[rgba(255,255,255,0.9)]"
              />
            </div>
          </div>

          <button
            onClick={sendMetaSignal}
            disabled={busy || loading}
            className="px-5 py-3 rounded-full border border-[rgba(255,255,255,0.14)] text-[rgba(255,255,255,0.9)] hover:bg-white/5 disabled:opacity-60"
          >
            Send Meta glasses signal
          </button>
        </section>

        <section className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[#1E1B18] p-6 space-y-4">
          <h2 className="text-xl text-[rgba(255,255,255,0.92)]" style={{ fontFamily: "Fraunces, serif" }}>
            Sessions
          </h2>

          {snapshot.sessions.length === 0 ? (
            <p className="text-sm text-[rgba(255,255,255,0.5)]">No sessions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {snapshot.sessions.slice(0, 6).map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border border-[rgba(255,255,255,0.1)] p-3 space-y-1"
                >
                  <p className="text-[rgba(255,255,255,0.9)] text-sm">{session.id}</p>
                  <p className="text-[rgba(255,255,255,0.55)] text-xs">
                    {formatTimestamp(session.startedAt)} to {session.endedAt ? formatTimestamp(session.endedAt) : "active"}
                  </p>
                  <p className="text-[rgba(255,255,255,0.55)] text-xs">
                    Clips: {session.clipPaths.length} | Speakers: {session.speakerWindows.map((entry) => entry.personTag).join(", ") || "none"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[#1E1B18] p-6 space-y-4">
          <h2 className="text-xl text-[rgba(255,255,255,0.92)]" style={{ fontFamily: "Fraunces, serif" }}>
            Recent signals
          </h2>

          {snapshot.recentEvents.length === 0 ? (
            <p className="text-sm text-[rgba(255,255,255,0.5)]">No signal events yet.</p>
          ) : (
            <div className="space-y-2">
              {snapshot.recentEvents.slice(0, 8).map((event, index) => (
                <div
                  key={`${event.timestamp}-${index}`}
                  className="rounded-xl border border-[rgba(255,255,255,0.08)] p-3 text-sm"
                >
                  <p className="text-[rgba(255,255,255,0.85)]">
                    {event.source} | level {event.audioLevel.toFixed(2)} | {formatTimestamp(event.timestamp)}
                  </p>
                  {event.presenceScore !== undefined ? (
                    <p className="text-[rgba(255,255,255,0.55)] text-xs">
                      Presence score: {event.presenceScore.toFixed(2)}
                    </p>
                  ) : null}
                  <p className="text-[rgba(255,255,255,0.55)] text-xs">
                    Hints: {event.speakerHints.map((hint) => `${hint.personTag} (${hint.speakingScore.toFixed(2)})`).join(", ") || "none"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
