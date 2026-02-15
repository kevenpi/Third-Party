"""
Pyannote diarization service for ThirdParty.

POST /diarize accepts raw audio bytes (WAV preferred) and returns
speaker turns with timestamps in milliseconds:
{
  "duration_sec": 12.34,
  "segments": [
    {"speaker": "S0", "start_ms": 0, "end_ms": 1400},
    {"speaker": "S1", "start_ms": 1500, "end_ms": 3900}
  ]
}
"""

import io
import os
import tempfile
from typing import Dict, List

import soundfile as sf
import torch
import torchaudio
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="ThirdParty Pyannote Diarizer")

TARGET_SR = 16000
_pipeline = None


def _auth_token() -> str:
    return (
        os.getenv("PYANNOTE_AUTH_TOKEN")
        or os.getenv("HF_TOKEN")
        or os.getenv("HUGGINGFACE_TOKEN")
        or ""
    ).strip()


def _load_pipeline():
    global _pipeline
    if _pipeline is None:
        from pyannote.audio import Pipeline

        token = _auth_token()
        if not token:
            raise RuntimeError(
                "Missing Hugging Face token. Set PYANNOTE_AUTH_TOKEN (or HF_TOKEN)."
            )
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=token,
        )
        if torch.cuda.is_available():
            _pipeline.to(torch.device("cuda"))
    return _pipeline


def _normalize_audio(raw: bytes) -> str:
    """
    Write normalized mono 16k WAV temp file and return path.
    """
    try:
        wav, sr = sf.read(io.BytesIO(raw), dtype="float32")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse audio bytes: {exc}") from exc

    if wav.ndim == 2:
        wav = wav.mean(axis=1)

    tensor = torch.from_numpy(wav).unsqueeze(0)
    if sr != TARGET_SR:
        tensor = torchaudio.functional.resample(tensor, sr, TARGET_SR)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        output = tmp.name
    sf.write(output, tensor.squeeze(0).numpy(), TARGET_SR)
    return output


@app.get("/health")
def health():
    return {"status": "ok", "model": "pyannote/speaker-diarization-3.1"}


@app.post("/diarize")
async def diarize(request: Request):
    raw = await request.body()
    if len(raw) < 1600:
        raise HTTPException(status_code=400, detail="Audio too short.")

    wav_path = None
    try:
        wav_path = _normalize_audio(raw)
        pipeline = _load_pipeline()
        diarization = pipeline(wav_path)

        speaker_map: Dict[str, str] = {}
        segments: List[dict] = []
        speaker_index = 0

        for turn, _, speaker in diarization.itertracks(yield_label=True):
            if speaker not in speaker_map:
                speaker_map[speaker] = f"S{speaker_index}"
                speaker_index += 1
            segments.append(
                {
                    "speaker": speaker_map[speaker],
                    "start_ms": int(round(max(0.0, float(turn.start)) * 1000)),
                    "end_ms": int(round(max(0.0, float(turn.end)) * 1000)),
                }
            )

        segments.sort(key=lambda seg: (seg["start_ms"], seg["end_ms"]))
        duration_sec = (segments[-1]["end_ms"] / 1000.0) if segments else 0.0

        return JSONResponse(
            content={
                "duration_sec": duration_sec,
                "speaker_count": len(speaker_map),
                "segments": segments,
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except Exception:
                pass
