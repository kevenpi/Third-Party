# Pyannote diarizer service

This service runs `pyannote/speaker-diarization-3.1` and exposes an HTTP endpoint used by the ThirdParty voice pipeline.

## 1) Install

```bash
cd services/pyannote
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate
pip install -r requirements.txt
```

## 2) Configure auth token

Pyannote model download requires a Hugging Face token with access to the model.

Set one of:

- `PYANNOTE_AUTH_TOKEN`
- `HF_TOKEN`
- `HUGGINGFACE_TOKEN`

## 3) Run

```bash
uvicorn app:app --host 0.0.0.0 --port 5010
```

From project root you can also run:

```bash
npm run diarizer
```

## 4) Wire into Next app

In `.env.local`:

```bash
VOICE_DIARIZATION_BACKEND=pyannote
PYANNOTE_DIARIZER_URL=http://localhost:5010/diarize
```

Optionally keep `OPENAI_API_KEY` set for automatic fallback if pyannote is unavailable.

## API

- `GET /health` -> `{ status, model }`
- `POST /diarize` with raw audio bytes (`application/octet-stream`) -> diarized segments
