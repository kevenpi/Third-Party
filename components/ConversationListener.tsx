"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startBiometricRecording,
  stopBiometricRecording,
  recordBiometricSample,
  isBiometricRecording,
  injectWatchData,
} from "@/lib/biometricRecorder";
import type { FaceIdentification } from "@shared/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      const [, base64] = result.split(",");
      resolve(base64 ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read audio blob"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Capture a single frame from a video element as a JPEG base64 string.
 */
function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): string | null {
  if (video.readyState < 2) return null;
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  // Return raw base64 (no data URL prefix)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  return dataUrl.split(",")[1] ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * When the app is "on" (listeningEnabled), keeps the microphone + camera
 * running and sends ingestSignal so conversation detection/recording works
 * on every page. Also handles:
 *   - Face identification via camera (GPT-4o Vision)
 *   - Biometric recording via voice stress analysis
 *   - Apple Watch HR/HRV ingestion
 */
export function ConversationListener() {
  const [listening, setListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [identifiedPerson, setIdentifiedPerson] = useState<FaceIdentification | null>(null);
  const [faceScanning, setFaceScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  // Audio
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Recording
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  // Transcript (browser SpeechRecognition)
  const transcriptTextRef = useRef<string>("");
  const transcriptWordsRef = useRef<number>(0);
  const transcriptConfidenceRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  // Camera / Face
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const identifiedPersonRef = useRef<FaceIdentification | null>(null);
  const faceCheckIntervalRef = useRef<number | null>(null);

  // Biometrics
  const bioIntervalRef = useRef<number | null>(null);
  const wasRecordingRef = useRef(false);

  // ------------------------------------------------------------------
  // Upload recorded clip when recording stops
  // ------------------------------------------------------------------

  const uploadClip = useCallback(async (sessionId: string) => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
    chunksRef.current = [];
    try {
      const audioBase64 = await blobToBase64(blob);
      await fetch("/api/conversationAwareness/uploadClip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, audioBase64, mimeType: mimeTypeRef.current }),
      });
      const form = new FormData();
      form.append("audio", blob, `clip_${sessionId}.webm`);
      void fetch("/api/voice/processOpenAI", { method: "POST", body: form });
    } catch {
      /* ignore */
    }
  }, []);

  // ------------------------------------------------------------------
  // Face identification
  // ------------------------------------------------------------------

  const identifyFaceFromCamera = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const frame = captureFrame(video, canvas);
    if (!frame) return;

    setFaceScanning(true);
    try {
      const res = await fetch("/api/face/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: frame }),
      });
      const data = await res.json();
      if (data.person) {
        const faceId: FaceIdentification = {
          personId: data.person.id,
          personName: data.person.name,
          confidence: data.person.confidence,
        };
        identifiedPersonRef.current = faceId;
        setIdentifiedPerson(faceId);
      } else {
        setIdentifiedPerson(null);
      }
      // If no match, also try saving as unknown face for later tagging
      if (!data.person && sessionIdRef.current) {
        void fetch("/api/face/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frameBase64: frame, saveUnknown: true, sessionId: sessionIdRef.current }) }).catch(() => {});
      }
    } catch {
      /* ignore */
    } finally {
      setFaceScanning(false);
    }
  }, []);

  const startFaceChecks = useCallback(() => {
    // Immediately identify, then every 10s
    void identifyFaceFromCamera();
    if (faceCheckIntervalRef.current !== null) return;
    faceCheckIntervalRef.current = window.setInterval(
      () => void identifyFaceFromCamera(),
      10_000
    );
  }, [identifyFaceFromCamera]);

  const stopFaceChecks = useCallback(() => {
    if (faceCheckIntervalRef.current !== null) {
      clearInterval(faceCheckIntervalRef.current);
      faceCheckIntervalRef.current = null;
    }
    identifiedPersonRef.current = null;
    setIdentifiedPerson(null);
    setFaceScanning(false);
  }, []);

  // ------------------------------------------------------------------
  // Biometric recording
  // ------------------------------------------------------------------

  const startBio = useCallback((sid: string) => {
    startBiometricRecording(sid);
    // Record a sample every 5 seconds
    if (bioIntervalRef.current !== null) return;
    bioIntervalRef.current = window.setInterval(() => {
      const analyser = analyserRef.current;
      const ctx = audioContextRef.current;
      if (!analyser || !ctx || !isBiometricRecording()) return;
      recordBiometricSample(analyser, ctx.sampleRate, transcriptWordsRef.current);
    }, 5_000);
  }, []);

  const stopBioAndAnalyze = useCallback(async (sid: string) => {
    if (bioIntervalRef.current !== null) {
      clearInterval(bioIntervalRef.current);
      bioIntervalRef.current = null;
    }
    const samples = stopBiometricRecording();
    if (samples.length === 0) return;

    // Send to analysis endpoint
    const person = identifiedPersonRef.current?.personName ?? "someone";
    try {
      await fetch("/api/biometrics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          person,
          startTime: new Date().toISOString(),
          biometricSamples: samples,
          transcript: transcriptTextRef.current || undefined,
        }),
      });
    } catch {
      /* ignore */
    }
  }, []);

  // ------------------------------------------------------------------
  // Browser audio recording (MediaRecorder)
  // ------------------------------------------------------------------

  const startBrowserRecording = useCallback(
    (sessionId: string) => {
      const stream = streamRef.current;
      if (!stream) return;
      const existing = recorderRef.current;
      if (existing && existing.state === "recording") return;

      chunksRef.current = [];
      sessionIdRef.current = sessionId;

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mimeTypeRef.current = recorder.mimeType || "audio/webm";
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const sid = sessionIdRef.current;
        recorderRef.current = null;
        sessionIdRef.current = null;
        if (sid) {
          void uploadClip(sid);
          void stopBioAndAnalyze(sid);
        }
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      // Start face identification and biometric recording
      startFaceChecks();
      startBio(sessionId);
    },
    [uploadClip, startFaceChecks, startBio, stopBioAndAnalyze]
  );

  const stopBrowserRecording = useCallback(() => {
    const recorder = recorderRef.current;
    stopFaceChecks();
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.stop();
      return;
    }
    recorderRef.current = null;
  }, [stopFaceChecks]);

  // ------------------------------------------------------------------
  // Poll Apple Watch data (when available)
  // ------------------------------------------------------------------

  const pollWatchData = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || !isBiometricRecording()) return;
    try {
      const res = await fetch(`/api/biometrics/ingest?sessionId=${sid}`);
      const data = await res.json();
      if (data.data?.hr && data.data?.hrv) {
        injectWatchData(data.data.hr, data.data.hrv);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // ------------------------------------------------------------------
  // Ingest mic signal every 800ms
  // ------------------------------------------------------------------

  const ingestMic = useCallback(async () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const n = (buffer[i] - 128) / 128;
      sum += n * n;
    }
    const audioLevel = Math.min(1, Math.sqrt(sum / buffer.length) * 2.6);
    setAudioLevel(audioLevel);

    // Build speaker hints — include face-identified person if available
    const speakerHints: { personTag: string; speakingScore: number }[] = [];
    const faceId = identifiedPersonRef.current;
    if (faceId) {
      speakerHints.push({ personTag: faceId.personName, speakingScore: 0.95 });
    }
    speakerHints.push({ personTag: "Me", speakingScore: Math.min(1, audioLevel + 0.45) });

    try {
      const response = await fetch("/api/conversationAwareness/ingestSignal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "meta_glasses" as const,
          audioLevel,
          transcriptText: transcriptTextRef.current || undefined,
          transcriptWords: transcriptWordsRef.current || undefined,
          transcriptConfidence: transcriptConfidenceRef.current || undefined,
          speakerHints,
          faceIdentification: faceId ?? undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.state) return;
      const state = payload.state as { isRecording?: boolean; activeSessionId?: string };
      const resolvedSessionId =
        state.activeSessionId ?? (payload?.session?.id as string | undefined) ?? null;

      const nowRecording = !!(state.isRecording && resolvedSessionId);
      setIsRecording(nowRecording);

      if (nowRecording && resolvedSessionId) {
        startBrowserRecording(resolvedSessionId);
      } else if (!nowRecording && wasRecordingRef.current) {
        stopBrowserRecording();
      }

      wasRecordingRef.current = nowRecording;

      // Poll Apple Watch data while recording
      if (nowRecording) {
        void pollWatchData();
      }
    } catch {
      /* ignore */
    }
  }, [startBrowserRecording, stopBrowserRecording, pollWatchData]);

  // ------------------------------------------------------------------
  // Poll listening state
  // ------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      fetch("/api/conversationAwareness/state")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const enabled = data?.state?.listeningEnabled === true;
          setListening(enabled);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ------------------------------------------------------------------
  // Start / stop mic + camera when listening changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!listening) {
      // Tear down everything
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopBrowserRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      const rec = recognitionRef.current;
      if (rec) {
        try { rec.stop(); } catch { /* ignore */ }
      }
      recognitionRef.current = null;
      transcriptTextRef.current = "";
      transcriptWordsRef.current = 0;
      transcriptConfidenceRef.current = 0;
      wasRecordingRef.current = false;
      return;
    }

    let cancelled = false;

    // Request microphone
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        analyserRef.current = analyser;
        intervalRef.current = window.setInterval(() => void ingestMic(), 800);

        // Browser speech recognition
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          const recognition = new SpeechRec();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";
          recognition.onresult = (event: any) => {
            let transcript = "";
            let bestConfidence = 0;
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const result = event.results[i];
              const alt = result?.[0];
              if (!alt?.transcript) continue;
              transcript += ` ${alt.transcript}`;
              if (typeof alt.confidence === "number") {
                bestConfidence = Math.max(bestConfidence, alt.confidence);
              }
            }
            transcript = transcript.trim();
            if (!transcript) return;
            transcriptTextRef.current = transcript.slice(0, 500);
            transcriptWordsRef.current = transcript.split(/\s+/).filter(Boolean).length;
            transcriptConfidenceRef.current = bestConfidence > 0 ? Math.min(1, bestConfidence) : 0.5;
          };
          recognition.onerror = () => {};
          recognition.onend = () => {
            if (listening && recognitionRef.current === recognition) {
              try { recognition.start(); } catch { /* ignore */ }
            }
          };
          recognitionRef.current = recognition;
          try { recognition.start(); } catch { /* ignore */ }
        }
      })
      .catch(() => {});

    // Request camera (back camera as Meta glasses proxy)
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((cameraStream) => {
        if (cancelled) {
          cameraStream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = cameraStream;

        // Create hidden video element for frame capture
        if (!videoRef.current) {
          const video = document.createElement("video");
          video.setAttribute("playsinline", "");
          video.setAttribute("autoplay", "");
          video.style.display = "none";
          document.body.appendChild(video);
          videoRef.current = video;
        }
        videoRef.current.srcObject = cameraStream;
        void videoRef.current.play();

        // Also feed the visible live preview
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = cameraStream;
          void liveVideoRef.current.play();
        }

        // Create canvas for frame capture
        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }
      })
      .catch(() => {
        // Camera not available — face identification disabled, app still works
        console.log("Camera not available — face identification disabled");
      });

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopBrowserRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      const rec = recognitionRef.current;
      if (rec) {
        try { rec.stop(); } catch { /* ignore */ }
      }
      recognitionRef.current = null;
      transcriptTextRef.current = "";
      transcriptWordsRef.current = 0;
      transcriptConfidenceRef.current = 0;
      wasRecordingRef.current = false;
    };
  }, [listening, ingestMic, stopBrowserRecording]);

  // Attach camera stream to live preview when ref mounts
  const attachCameraToPreview = useCallback(
    (el: HTMLVideoElement | null) => {
      liveVideoRef.current = el;
      if (el && cameraStreamRef.current) {
        el.srcObject = cameraStreamRef.current;
        void el.play();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listening],
  );

  if (!listening) return null;

  // Map audio level (0-1) to visual intensity
  const intensity = Math.min(1, audioLevel * 4);
  const size = 16 + intensity * 16; // 16-32px
  const indicatorColor = isRecording ? "#EF4444" : "#7AB89E";
  const spread = 4 + intensity * 24;
  const opacity = 0.4 + intensity * 0.6;

  const confidenceColor =
    identifiedPerson?.confidence === "high"
      ? "#7AB89E"
      : identifiedPerson?.confidence === "medium"
        ? "#D4B07A"
        : "#B84A3A";

  return (
    <>
      <style>{`
        @keyframes listener-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes face-scan {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
        @keyframes face-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(122,184,158,0.4); }
          50% { box-shadow: 0 0 18px rgba(122,184,158,0.7); }
        }
      `}</style>

      {/* ── Live Camera Preview (picture-in-picture) ── */}
      <div
        style={{
          position: "fixed",
          top: 72,
          right: 12,
          zIndex: 9998,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 0,
        }}
      >
        {/* Toggle button */}
        <button
          onClick={() => setShowCamera((v) => !v)}
          style={{
            background: "rgba(30,27,24,0.85)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: showCamera ? "8px 8px 0 0" : 8,
            padding: "4px 10px",
            fontSize: 10,
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            fontFamily: "Plus Jakarta Sans, sans-serif",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: identifiedPerson ? confidenceColor : faceScanning ? "#D4B07A" : "rgba(255,255,255,0.25)",
              boxShadow: identifiedPerson ? `0 0 6px ${confidenceColor}` : "none",
              transition: "all 0.3s ease",
            }}
          />
          {showCamera ? "hide" : "camera"}
        </button>

        {showCamera && (
          <div
            style={{
              width: 160,
              borderRadius: "0 0 12px 12px",
              overflow: "hidden",
              border: identifiedPerson
                ? `2px solid ${confidenceColor}`
                : "1px solid rgba(255,255,255,0.1)",
              background: "#000",
              boxShadow: identifiedPerson
                ? `0 4px 20px rgba(0,0,0,0.6), 0 0 12px ${confidenceColor}40`
                : "0 4px 20px rgba(0,0,0,0.6)",
              position: "relative",
              transition: "border-color 0.4s ease, box-shadow 0.4s ease",
            }}
          >
            {/* Video feed */}
            <video
              ref={attachCameraToPreview}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: 120,
                objectFit: "cover",
                display: "block",
              }}
            />

            {/* Scanning line animation */}
            {faceScanning && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "linear-gradient(90deg, transparent, #D4B07A, transparent)",
                  animation: "face-scan 1.5s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Corner brackets (face target) */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
              {/* Top-left */}
              <div style={{ position: "absolute", top: 14, left: 14, width: 16, height: 16, borderTop: "2px solid rgba(255,255,255,0.3)", borderLeft: "2px solid rgba(255,255,255,0.3)", borderRadius: "2px 0 0 0" }} />
              {/* Top-right */}
              <div style={{ position: "absolute", top: 14, right: 14, width: 16, height: 16, borderTop: "2px solid rgba(255,255,255,0.3)", borderRight: "2px solid rgba(255,255,255,0.3)", borderRadius: "0 2px 0 0" }} />
              {/* Bottom-left */}
              <div style={{ position: "absolute", bottom: 40, left: 14, width: 16, height: 16, borderBottom: "2px solid rgba(255,255,255,0.3)", borderLeft: "2px solid rgba(255,255,255,0.3)", borderRadius: "0 0 0 2px" }} />
              {/* Bottom-right */}
              <div style={{ position: "absolute", bottom: 40, right: 14, width: 16, height: 16, borderBottom: "2px solid rgba(255,255,255,0.3)", borderRight: "2px solid rgba(255,255,255,0.3)", borderRadius: "0 0 2px 0" }} />
            </div>

            {/* Identification result bar */}
            <div
              style={{
                padding: "6px 10px",
                background: "rgba(18,17,15,0.92)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                minHeight: 28,
              }}
            >
              {identifiedPerson ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: confidenceColor,
                        boxShadow: `0 0 6px ${confidenceColor}`,
                        animation: "face-glow 2s ease-in-out infinite",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.95)",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                      }}
                    >
                      {identifiedPerson.personName}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      color: confidenceColor,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {identifiedPerson.confidence}
                  </span>
                </>
              ) : faceScanning ? (
                <span
                  style={{
                    fontSize: 10,
                    color: "#D4B07A",
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    letterSpacing: "0.03em",
                  }}
                >
                  Scanning...
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    letterSpacing: "0.03em",
                  }}
                >
                  No face detected
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Audio indicator (bottom center) ── */}
      <div
        style={{
          position: "fixed",
          bottom: 76,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            backgroundColor: indicatorColor,
            opacity,
            boxShadow: `0 0 ${spread}px ${Math.round(spread * 0.5)}px ${indicatorColor}`,
            transition: "width 0.15s ease-out, height 0.15s ease-out, opacity 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.3s ease",
            animation: isRecording ? "listener-pulse 2s ease-in-out infinite" : "none",
          }}
        />
        <span
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.4)",
            fontFamily: "Plus Jakarta Sans, sans-serif",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {isRecording ? "recording" : "listening"}
        </span>
      </div>
    </>
  );
}
