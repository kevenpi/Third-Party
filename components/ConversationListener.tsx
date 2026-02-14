"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * When the app is "on" (listeningEnabled from API), keeps the microphone running
 * and sends ingestSignal so conversation detection/recording work on every page.
 */
export function ConversationListener() {
  const [listening, setListening] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const detectorSessionIdRef = useRef<string | null>(null);
  const detectorRecordingRef = useRef<boolean>(false);
  const mimeTypeRef = useRef<string>("audio/webm");
  const transcriptTextRef = useRef<string>("");
  const transcriptWordsRef = useRef<number>(0);
  const transcriptConfidenceRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const noiseFloorRef = useRef<number>(0.01);

  const uploadClip = useCallback(async (sessionId: string, blob: Blob) => {
    if (blob.size === 0) return;
    try {
      const audioBase64 = await blobToBase64(blob);
      await fetch("/api/conversationAwareness/uploadClip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          audioBase64,
          mimeType: mimeTypeRef.current
        })
      });
      // Near-live transcription on finalized clip.
      const form = new FormData();
      form.append("audio", blob, `clip_${sessionId}.webm`);
      void fetch("/api/voice/processOpenAI", { method: "POST", body: form });
    } catch {
      /* ignore */
    }
  }, []);

  const startContinuousRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const existing = recorderRef.current;
    if (existing && existing.state === "recording") return;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    } catch {
      recorder = new MediaRecorder(stream);
    }
    mimeTypeRef.current = recorder.mimeType || "audio/webm";
    recorder.ondataavailable = (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      const sid = detectorSessionIdRef.current;
      if (!detectorRecordingRef.current || !sid) return;
      void uploadClip(sid, event.data);
    };
    recorder.onstop = () => {
      recorderRef.current = null;
    };
    // 5-second chunks: keep conversation chunks, discard non-conversation chunks.
    recorder.start(5000);
    recorderRef.current = recorder;
  }, [uploadClip]);

  const stopBrowserRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.stop();
      return;
    }
    recorderRef.current = null;
  }, []);

  const ingestMic = useCallback(async () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const ctx = audioContextRef.current;
    if (ctx?.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const n = (buffer[i] - 128) / 128;
      sum += n * n;
    }
    const rms = Math.sqrt(sum / buffer.length);
    const floor = noiseFloorRef.current;
    const nextFloor = floor * 0.97 + rms * 0.03;
    noiseFloorRef.current = Math.min(0.08, Math.max(0.003, nextFloor));
    const normalized = Math.max(0, rms - noiseFloorRef.current);
    const audioLevel = Math.min(1, normalized * 6.5);
    try {
      const response = await fetch("/api/conversationAwareness/ingestSignal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "microphone",
          audioLevel,
          transcriptText: transcriptTextRef.current || undefined,
          transcriptWords: transcriptWordsRef.current || undefined,
          transcriptConfidence: transcriptConfidenceRef.current || undefined,
          speakerHints: [{ personTag: "Me", speakingScore: Math.min(1, audioLevel + 0.45) }]
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.state) return;
      const state = payload.state as { isRecording?: boolean; activeSessionId?: string };
      detectorRecordingRef.current = state.isRecording === true;
      detectorSessionIdRef.current =
        state.activeSessionId ?? (payload?.session?.id as string | undefined) ?? null;
    } catch {
      /* ignore */
    }
  }, []);

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

  useEffect(() => {
    if (!listening) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopBrowserRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
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
      return;
    }

    let cancelled = false;
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
        noiseFloorRef.current = 0.01;
        startContinuousRecording();
        void ingestMic();
        intervalRef.current = window.setInterval(() => void ingestMic(), 800);

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
      .catch((error) => {
        console.error("[ConversationListener] microphone start failed", error);
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
    };
  }, [ingestMic, listening, startContinuousRecording, stopBrowserRecording]);

  return null;
}
