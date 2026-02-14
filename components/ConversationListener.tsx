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
  const chunksRef = useRef<BlobPart[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  const uploadClip = useCallback(async (sessionId: string) => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
    chunksRef.current = [];
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
    } catch {
      /* ignore */
    }
  }, []);

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
        if (sid) void uploadClip(sid);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
    },
    [uploadClip]
  );

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
    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const n = (buffer[i] - 128) / 128;
      sum += n * n;
    }
    const audioLevel = Math.min(1, Math.sqrt(sum / buffer.length) * 2.6);
    try {
      const response = await fetch("/api/conversationAwareness/ingestSignal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "microphone",
          audioLevel,
          speakerHints: [{ personTag: "Me", speakingScore: Math.min(1, audioLevel + 0.25) }]
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.state) return;
      const state = payload.state as { isRecording?: boolean; activeSessionId?: string };
      const resolvedSessionId =
        state.activeSessionId ?? (payload?.session?.id as string | undefined) ?? null;

      if (state.isRecording && resolvedSessionId) {
        startBrowserRecording(resolvedSessionId);
      } else {
        stopBrowserRecording();
      }
    } catch {
      /* ignore */
    }
  }, [startBrowserRecording, stopBrowserRecording]);

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
        intervalRef.current = window.setInterval(() => void ingestMic(), 1200);
      })
      .catch(() => {});

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
    };
  }, [listening, ingestMic, stopBrowserRecording]);

  return null;
}
