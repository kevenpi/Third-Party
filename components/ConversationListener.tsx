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
  const [uncertainCandidate, setUncertainCandidate] = useState<FaceIdentification | null>(null);
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [liveLines, setLiveLines] = useState<{ id: number; speaker: string; text: string; time: string; isFinal: boolean }[]>([]);
  const [speechRecStatus, setSpeechRecStatus] = useState<"checking" | "active" | "unavailable" | "error">("checking");
  const [currentBuffer, setCurrentBuffer] = useState("");
  const [enrollMode, setEnrollMode] = useState(false);
  const [enrollName, setEnrollName] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const liveLineIdRef = useRef(0);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraReadyRef = useRef(false);
  const transcriptPanelRef = useRef<HTMLDivElement | null>(null);

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
  const transcriptUpdatedAtRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  // Camera / Face
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const identifiedPersonRef = useRef<FaceIdentification | null>(null);
  const faceCheckIntervalRef = useRef<number | null>(null);
  const uncertainDismissUntilRef = useRef<number>(0);
  const faceScanPausedUntilRef = useRef<number>(0);
  const faceScanFailureCountRef = useRef<number>(0);

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
    } catch {
      /* ignore */
    }
  }, []);

  // ------------------------------------------------------------------
  // Face identification
  // ------------------------------------------------------------------

  const identifyFaceFromCamera = useCallback(async () => {
    if (!showCamera && !isRecording) return;
    if (Date.now() < faceScanPausedUntilRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      setFaceError("Camera not ready");
      return;
    }
    const frame = captureFrame(video, canvas);
    if (!frame) {
      setFaceError("Frame capture failed");
      return;
    }

    setFaceScanning(true);
    setFaceError(null);
    try {
      const res = await fetch("/api/face/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: frame }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error ?? `API ${res.status}`;
        setFaceError(errMsg.length > 50 ? errMsg.slice(0, 50) + "…" : errMsg);
        setIdentifiedPerson(null);
        return;
      }
      if (data.person) {
        faceScanFailureCountRef.current = 0;
        faceScanPausedUntilRef.current = 0;
        const faceId: FaceIdentification = {
          personId: data.person.id,
          personName: data.person.name,
          confidence: data.person.confidence,
        };
        identifiedPersonRef.current = faceId;
        setIdentifiedPerson(faceId);
        setUncertainCandidate(null);
        setFaceError(null);
      } else {
        identifiedPersonRef.current = null;
        setIdentifiedPerson(null);
        const uncertain = data?.uncertainCandidate as
          | { id: string; name: string; confidence: "high" | "medium" | "low" }
          | null
          | undefined;
        if (
          uncertain &&
          Date.now() > uncertainDismissUntilRef.current &&
          uncertain.id &&
          uncertain.name
        ) {
          setUncertainCandidate({
            personId: uncertain.id,
            personName: uncertain.name,
            confidence: uncertain.confidence,
          });
          setFaceError(null);
        } else {
          setUncertainCandidate(null);
        }

        // Use reason from server for precise diagnostics
        const reason = data.reason as string | undefined;
        const enrolledCount = (data.enrolledCount as number) ?? 0;
        const errorDetail = (data.errorDetail as string | undefined)?.trim();
        if (data.noEnrolledFaces || reason === "no_enrolled") {
          setFaceError("No faces enrolled");
        } else if (reason === "no_api_key") {
          setFaceError(`No OpenAI key (${enrolledCount} enrolled)`);
        } else if (reason === "api_error") {
          faceScanFailureCountRef.current += 1;
          const lowered = (errorDetail ?? "").toLowerCase();
          const isRateOrQuota =
            lowered.includes("rate") ||
            lowered.includes("quota") ||
            lowered.includes("429") ||
            lowered.includes("insufficient_quota");
          const backoffMs = isRateOrQuota
            ? 60_000
            : Math.min(45_000, 5_000 * 2 ** Math.min(4, faceScanFailureCountRef.current));
          faceScanPausedUntilRef.current = Date.now() + backoffMs;
          const waitSec = Math.max(1, Math.round(backoffMs / 1000));
          const suffix = errorDetail ? `: ${errorDetail.slice(0, 90)}` : "";
          setFaceError(`Vision API error (${enrolledCount} enrolled, retry in ${waitSec}s)${suffix}`);
        } else if (reason === "no_parse") {
          setFaceError(`Bad API response (${enrolledCount} enrolled)`);
        } else if (reason === "no_match" && !uncertain) {
          faceScanFailureCountRef.current = 0;
          setFaceError(`No match (${enrolledCount} enrolled)`);
        } else if (!uncertain) {
          setFaceError(null);
        }
      }
      // If no match, also try saving as unknown face for later tagging
      if (!data.person && sessionIdRef.current) {
        void fetch("/api/face/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frameBase64: frame, saveUnknown: true, sessionId: sessionIdRef.current }) }).catch(() => {});
      }
    } catch (err) {
      setFaceError("Connection failed");
    } finally {
      setFaceScanning(false);
    }
  }, [isRecording, showCamera]);

  const startFaceChecks = useCallback(() => {
    // Immediately identify, then every 10s (avoid Vision throttling/quota spikes)
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
    setUncertainCandidate(null);
    setFaceScanning(false);
    setFaceError(null);
    faceScanPausedUntilRef.current = 0;
    faceScanFailureCountRef.current = 0;
  }, []);

  const confirmUncertainCandidate = useCallback(() => {
    const candidate = uncertainCandidate;
    if (!candidate) return;
    const confirmed: FaceIdentification = {
      personId: candidate.personId,
      personName: candidate.personName,
      confidence: "high",
    };
    identifiedPersonRef.current = confirmed;
    setIdentifiedPerson(confirmed);
    setUncertainCandidate(null);
    setFaceError(null);
    void fetch("/api/face/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmPersonId: confirmed.personId,
        confirmPersonName: confirmed.personName,
      }),
    }).catch(() => {});
  }, [uncertainCandidate]);

  const dismissUncertainCandidate = useCallback(() => {
    setUncertainCandidate(null);
    uncertainDismissUntilRef.current = Date.now() + 20_000;
  }, []);

  // ------------------------------------------------------------------
  // Face enrollment from live camera
  // ------------------------------------------------------------------

  const enrollFaceFromCamera = useCallback(async (name: string) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !name.trim()) return;
    const frame = captureFrame(video, canvas);
    if (!frame) {
      setFaceError("Could not capture frame");
      return;
    }
    setEnrolling(true);
    setFaceError(null);
    try {
      const personId = name.trim().toLowerCase().replace(/\s+/g, "_");
      const res = await fetch("/api/face/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, name: name.trim(), imageBase64: frame }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFaceError(data?.error ?? "Enrollment failed");
        return;
      }
      // Enrollment succeeded — clear cache and immediately try to identify
      setEnrollMode(false);
      setEnrollName("");
      setFaceError(null);
      // Trigger an immediate face check
      void identifyFaceFromCamera();
    } catch {
      setFaceError("Enrollment request failed");
    } finally {
      setEnrolling(false);
    }
  }, [identifyFaceFromCamera]);

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
    const hasSpeechNow = audioLevel >= 0.05;
    const transcriptFresh = Date.now() - transcriptUpdatedAtRef.current < 1_800;
    const meScore = hasSpeechNow
      ? Math.min(1, 0.45 + (transcriptFresh ? 0.45 : 0.15) + audioLevel * 0.35)
      : 0.08;

    speakerHints.push({ personTag: "Me", speakingScore: meScore });

    if (faceId) {
      const otherScore = hasSpeechNow
        ? transcriptFresh
          ? Math.min(1, 0.2 + audioLevel * 0.2)
          : Math.min(1, 0.62 + audioLevel * 0.35)
        : 0.08;
      speakerHints.push({ personTag: faceId.personName, speakingScore: otherScore });
    }

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
      stopFaceChecks();
      cameraReadyRef.current = false;
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
      transcriptUpdatedAtRef.current = 0;
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
          try {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-US";
            let pendingInterimId: number | null = null;
            recognition.onresult = (event: any) => {
              let transcript = "";
              let bestConfidence = 0;
              let hasFinal = false;
              for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const result = event.results[i];
                const alt = result?.[0];
                if (!alt?.transcript) continue;
                transcript += ` ${alt.transcript}`;
                if (typeof alt.confidence === "number") {
                  bestConfidence = Math.max(bestConfidence, alt.confidence);
                }
                if (result.isFinal) hasFinal = true;
              }
              transcript = transcript.trim();
              if (!transcript) return;
              transcriptTextRef.current = transcript.slice(0, 500);
              transcriptWordsRef.current = transcript.split(/\s+/).filter(Boolean).length;
              transcriptConfidenceRef.current = bestConfidence > 0 ? Math.min(1, bestConfidence) : 0.5;
              transcriptUpdatedAtRef.current = Date.now();

              // Push to live transcript panel
              const now = new Date();
              const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              const speaker = identifiedPersonRef.current
                ? (bestConfidence > 0.7 ? "Me" : identifiedPersonRef.current.personName)
                : "Speaker";

              if (hasFinal) {
                // Replace interim with final
                const id = liveLineIdRef.current++;
                setLiveLines((prev) => {
                  const filtered = pendingInterimId !== null
                    ? prev.filter((l) => l.id !== pendingInterimId)
                    : prev;
                  return [...filtered, { id, speaker, text: transcript, time: timeStr, isFinal: true }].slice(-50);
                });
                pendingInterimId = null;
              } else {
                // Update or create interim line
                if (pendingInterimId === null) {
                  pendingInterimId = liveLineIdRef.current++;
                }
                const interimId = pendingInterimId;
                setLiveLines((prev) => {
                  const existing = prev.findIndex((l) => l.id === interimId);
                  if (existing >= 0) {
                    const copy = [...prev];
                    copy[existing] = { ...copy[existing], text: transcript, time: timeStr, speaker };
                    return copy;
                  }
                  return [...prev, { id: interimId, speaker, text: transcript, time: timeStr, isFinal: false }].slice(-50);
                });
              }
            };
            recognition.onerror = (e: any) => {
              const errType = e?.error ?? "unknown";
              if (errType === "not-allowed" || errType === "service-not-allowed") {
                setSpeechRecStatus("error");
              }
            };
            recognition.onend = () => {
              if (listening && recognitionRef.current === recognition) {
                try { recognition.start(); } catch { /* ignore */ }
              }
            };
            recognitionRef.current = recognition;
            recognition.start();
            setSpeechRecStatus("active");
          } catch {
            setSpeechRecStatus("error");
          }
        } else {
          setSpeechRecStatus("unavailable");
        }

      })
      .catch(() => {
        setSpeechRecStatus("unavailable");
      });

    // Sync transcript buffer to state every 400ms for live display
    const bufferSyncId = window.setInterval(() => {
      setCurrentBuffer(transcriptTextRef.current);
    }, 400);

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

        // Start face identification immediately (don't wait for recording)
        cameraReadyRef.current = true;
        startFaceChecks();
      })
      .catch(() => {
        // Camera not available — face identification disabled, app still works
        console.log("Camera not available — face identification disabled");
      });

    return () => {
      cancelled = true;
      clearInterval(bufferSyncId);
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
      transcriptUpdatedAtRef.current = 0;
      wasRecordingRef.current = false;
    };
  }, [listening, ingestMic, stopBrowserRecording, startFaceChecks, stopFaceChecks]);

  // Auto-scroll transcript panel
  useEffect(() => {
    if (transcriptPanelRef.current && showTranscript) {
      transcriptPanelRef.current.scrollTop = transcriptPanelRef.current.scrollHeight;
    }
  }, [liveLines, showTranscript]);

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

  const faceState = identifiedPerson ?? uncertainCandidate;
  const confidenceColor =
    faceState?.confidence === "high"
      ? "#7AB89E"
      : faceState?.confidence === "medium"
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
              background: faceState ? confidenceColor : faceError ? "#B84A3A" : faceScanning ? "#D4B07A" : "rgba(255,255,255,0.25)",
              boxShadow: faceState ? `0 0 6px ${confidenceColor}` : faceError ? "0 0 6px #B84A3A" : "none",
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
              border: faceState
                ? `2px solid ${confidenceColor}`
                : "1px solid rgba(255,255,255,0.1)",
              background: "#000",
              boxShadow: faceState
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
                flexDirection: "column",
                gap: 7,
                minHeight: uncertainCandidate || enrollMode ? 60 : 28,
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
              ) : uncertainCandidate ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: "#D4B07A",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                        letterSpacing: "0.03em",
                      }}
                    >
                      Not fully sure. Is this {uncertainCandidate.personName}?
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: confidenceColor,
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {uncertainCandidate.confidence}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={confirmUncertainCandidate}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        border: "1px solid rgba(122,184,158,0.45)",
                        background: "rgba(122,184,158,0.15)",
                        color: "#7AB89E",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "5px 0",
                        cursor: "pointer",
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={dismissUncertainCandidate}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(255,255,255,0.03)",
                        color: "rgba(255,255,255,0.7)",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "5px 0",
                        cursor: "pointer",
                      }}
                    >
                      Not sure
                    </button>
                  </div>
                </>
              ) : faceError && !enrollMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: faceError.includes("No faces enrolled") || faceError.includes("No match")
                        ? "#D4B07A"
                        : "#B84A3A",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {faceError}
                  </span>
                  {(faceError.includes("No faces enrolled") || faceError.includes("No match") || faceError.includes("No OpenAI")) && (
                    <button
                      type="button"
                      onClick={() => setEnrollMode(true)}
                      style={{
                        borderRadius: 6,
                        border: "1px solid rgba(212,176,122,0.35)",
                        background: "rgba(212,176,122,0.1)",
                        color: "#D4B07A",
                        fontSize: 9,
                        fontWeight: 600,
                        padding: "4px 8px",
                        cursor: "pointer",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                      }}
                    >
                      + Enroll face
                    </button>
                  )}
                </div>
              ) : enrollMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "#D4B07A", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                    Look at the camera, type your name:
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      type="text"
                      value={enrollName}
                      onChange={(e) => setEnrollName(e.target.value)}
                      placeholder="Name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && enrollName.trim()) {
                          void enrollFaceFromCamera(enrollName);
                        }
                      }}
                      style={{
                        flex: 1,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 11,
                        color: "#fff",
                        outline: "none",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                      }}
                    />
                    <button
                      type="button"
                      disabled={enrolling || !enrollName.trim()}
                      onClick={() => void enrollFaceFromCamera(enrollName)}
                      style={{
                        borderRadius: 6,
                        border: "1px solid rgba(122,184,158,0.5)",
                        background: enrolling ? "rgba(122,184,158,0.08)" : "rgba(122,184,158,0.2)",
                        color: "#7AB89E",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "4px 10px",
                        cursor: enrolling ? "wait" : "pointer",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {enrolling ? "..." : "Save"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEnrollMode(false); setEnrollName(""); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,0.3)",
                      fontSize: 9,
                      cursor: "pointer",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      padding: 0,
                      textAlign: "left",
                    }}
                  >
                    cancel
                  </button>
                </div>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                  <button
                    type="button"
                    onClick={() => setEnrollMode(true)}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: 9,
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      textAlign: "center",
                    }}
                  >
                    + Enroll face
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Live Transcript Panel (pops up from the circle) ── */}
      {showTranscript && (
        <div
          style={{
            position: "fixed",
            bottom: 110,
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(92vw, 380px)",
            maxHeight: "45vh",
            zIndex: 10000,
            background: "rgba(18,17,15,0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isRecording ? "#EF4444" : "#7AB89E",
                  boxShadow: isRecording ? "0 0 8px #EF4444" : "0 0 6px #7AB89E",
                  animation: isRecording ? "listener-pulse 2s ease-in-out infinite" : "none",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.8)",
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Live Transcript
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {identifiedPerson && (
                <span style={{ fontSize: 10, color: "#7AB89E", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                  {identifiedPerson.personName}
                </span>
              )}
              <button
                onClick={() => setShowTranscript(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 16,
                  cursor: "pointer",
                  padding: "0 4px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Status bar */}
          <div
            style={{
              padding: "6px 14px",
              background: "rgba(255,255,255,0.02)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {/* Audio level mini-bar */}
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(100, audioLevel * 200)}%`,
                  height: "100%",
                  background: isRecording ? "#EF4444" : "#7AB89E",
                  borderRadius: 2,
                  transition: "width 0.15s ease-out",
                }}
              />
            </div>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "Plus Jakarta Sans, sans-serif", whiteSpace: "nowrap" }}>
              {speechRecStatus === "active" ? "speech rec on" : speechRecStatus === "unavailable" ? "speech rec n/a" : speechRecStatus === "error" ? "speech rec error" : "checking..."}
            </span>
          </div>

          {/* Current buffer (live speech) */}
          {currentBuffer && (
            <div
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(212,176,122,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4B07A", animation: "listener-pulse 1.5s ease-in-out infinite" }} />
                <span style={{ fontSize: 9, color: "#D4B07A", fontFamily: "Plus Jakarta Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Now hearing
                </span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Plus Jakarta Sans, sans-serif", lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
                {currentBuffer}
              </p>
            </div>
          )}

          {/* Transcript lines */}
          <div
            ref={transcriptPanelRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minHeight: 80,
            }}
          >
            {liveLines.length === 0 && !currentBuffer ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                {speechRecStatus === "unavailable" ? (
                  <>
                    <p style={{ fontSize: 12, color: "#B84A3A", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                      Speech Recognition not available
                    </p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "Plus Jakarta Sans, sans-serif", marginTop: 6 }}>
                      Use Chrome or Edge for live transcription
                    </p>
                  </>
                ) : speechRecStatus === "error" ? (
                  <>
                    <p style={{ fontSize: 12, color: "#B84A3A", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                      Microphone access denied
                    </p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "Plus Jakarta Sans, sans-serif", marginTop: 6 }}>
                      Allow mic permission and reload
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                      {audioLevel > 0.02 ? "Hearing audio, processing..." : "Start speaking to see the transcript"}
                    </p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "Plus Jakarta Sans, sans-serif", marginTop: 6 }}>
                      Words appear here in real time with speaker labels
                    </p>
                  </>
                )}
              </div>
            ) : (
              liveLines.map((line) => {
                const isMe = line.speaker === "Me" || line.speaker === "Speaker";
                return (
                  <div
                    key={line.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      opacity: line.isFinal ? 1 : 0.6,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: isMe ? "#D4B07A" : "#6AAAB4",
                          fontFamily: "Plus Jakarta Sans, sans-serif",
                        }}
                      >
                        {line.speaker}
                      </span>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{line.time}</span>
                      {!line.isFinal && (
                        <span style={{ fontSize: 8, color: "#D4B07A", fontStyle: "italic" }}>live</span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.85)",
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                        lineHeight: 1.5,
                        margin: 0,
                        paddingLeft: 2,
                      }}
                    >
                      {line.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "6px 14px 8px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              {liveLines.filter((l) => l.isFinal).length} finalized &middot; {liveLines.length} total
            </span>
            {liveLines.length > 0 && (
              <button
                onClick={() => setLiveLines([])}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.25)",
                  fontSize: 9,
                  cursor: "pointer",
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Audio indicator (bottom center, clickable) ── */}
      <button
        onClick={() => setShowTranscript((v) => !v)}
        style={{
          position: "fixed",
          bottom: 76,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
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
          {showTranscript ? "close" : isRecording ? "recording" : "listening"}
        </span>
      </button>
    </>
  );
}
