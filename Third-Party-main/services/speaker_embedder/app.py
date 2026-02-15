"""
Speaker embedding service using SpeechBrain ECAPA-TDNN (spkrec-ecapa-voxceleb).
- POST /embed: audio (WAV or raw PCM 16kHz mono) -> { "embedding": [float, ...] }  (192 dims)
- POST /verify: two audio files -> { "same_speaker": bool, "score": float }

Model expects 16kHz mono. We resample if needed.
"""

import io
import os
import tempfile
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="Speaker Embedder (ECAPA-TDNN)")

_classifier = None
_verification = None
TARGET_SR = 16000


def _load_classifier():
    global _classifier
    if _classifier is None:
        from speechbrain.inference.speaker import EncoderClassifier
        run_opts = {"device": "cuda"} if torch.cuda.is_available() else {}
        _classifier = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir="pretrained_models/spkrec-ecapa-voxceleb",
            run_opts=run_opts,
        )
    return _classifier


def _load_verification():
    global _verification
    if _verification is None:
        from speechbrain.inference.speaker import SpeakerRecognition
        run_opts = {"device": "cuda"} if torch.cuda.is_available() else {}
        _verification = SpeakerRecognition.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir="pretrained_models/spkrec-ecapa-voxceleb",
            run_opts=run_opts,
        )
    return _verification


def _audio_to_tensor(raw: bytes, sample_rate_hint: int = 16000):
    """Convert raw bytes to (1, samples) tensor at 16kHz. Accepts WAV or raw PCM."""
    try:
        import soundfile as sf
        wav, sr = sf.read(io.BytesIO(raw), dtype="float32")
        if wav.ndim == 2:
            wav = wav.mean(axis=1)
        if sr != TARGET_SR:
            import torchaudio
            t = torch.from_numpy(wav).unsqueeze(0)
            t = torchaudio.functional.resample(t, sr, TARGET_SR)
            wav = t.squeeze(0).numpy()
        return torch.from_numpy(wav).unsqueeze(0), TARGET_SR
    except Exception:
        pass
    # Fallback: treat as raw PCM 16-bit mono
    try:
        arr = np.frombuffer(raw, dtype=np.int16)
        wav = arr.astype(np.float32) / 32768.0
        if len(wav) < 1600:
            raise ValueError("Audio too short (need at least ~0.1s)")
        t = torch.from_numpy(wav).unsqueeze(0)
        if sample_rate_hint != TARGET_SR:
            import torchaudio
            t = torchaudio.functional.resample(t, sample_rate_hint, TARGET_SR)
        return t, TARGET_SR
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse audio: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "model": "speechbrain/spkrec-ecapa-voxceleb"}


@app.post("/embed")
async def embed(request: Request):
    """
    Compute speaker embedding. Send audio as:
    - Raw body (application/octet-stream): WAV or raw PCM 16kHz mono, or
    - Multipart form with "audio" file.
    Returns: { "embedding": [float, ...] } (192 dims).
    """
    content_type = request.headers.get("content-type", "") or ""
    if "multipart" in content_type:
        form = await request.form()
        f = form.get("audio") or form.get("file")
        if f is None or not hasattr(f, "read"):
            raise HTTPException(status_code=400, detail="Multipart form must include 'audio' file")
        raw = await f.read()
    else:
        raw = await request.body()
    if len(raw) < 1600:
        raise HTTPException(status_code=400, detail="Audio too short (need at least ~0.1s)")
    try:
        signal, _ = _audio_to_tensor(raw)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    classifier = _load_classifier()
    with torch.no_grad():
        emb = classifier.encode_batch(signal)
    out = emb.squeeze(0).cpu().numpy().tolist()
    return JSONResponse(content={"embedding": out})


@app.post("/verify")
async def verify(
    audio1: UploadFile = File(...),
    audio2: UploadFile = File(...),
):
    """
    Verify if two audio clips are from the same speaker.
    Returns: { "same_speaker": bool, "score": float }.
    """
    raw1 = await audio1.read()
    raw2 = await audio2.read()
    try:
        sig1, _ = _audio_to_tensor(raw1)
        sig2, _ = _audio_to_tensor(raw2)
    except HTTPException:
        raise
    f1_path = f2_path = None
    try:
        import soundfile as sf
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f1:
            f1_path = f1.name
            sf.write(f1_path, sig1.squeeze(0).numpy(), TARGET_SR)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f2:
            f2_path = f2.name
            sf.write(f2_path, sig2.squeeze(0).numpy(), TARGET_SR)
        verification = _load_verification()
        score, prediction = verification.verify_files(f1_path, f2_path)
        same = bool(prediction.item() if hasattr(prediction, "item") else prediction)
        return JSONResponse(content={"same_speaker": same, "score": float(score)})
    finally:
        for p in (f1_path, f2_path):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except Exception:
                    pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
