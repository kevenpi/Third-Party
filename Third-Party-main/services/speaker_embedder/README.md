# Speaker embedder service (SpeechBrain ECAPA-TDNN)

HTTP service that computes **speaker embeddings** (192-d) and optional **verification** (same/different speaker) using [SpeechBrain spkrec-ecapa-voxceleb](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb). Used by the ThirdParty voice pipeline so real voices are recognized and grouped by profile.

## Install

```bash
cd services/speaker_embedder
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

First run will download the pretrained model (~90MB).

## Run

From this directory:

```bash
uvicorn app:app --host 0.0.0.0 --port 5000
```

Or from the **project root** (after installing deps here once): `npm run embedder`.

Then set in your Node app `.env.local`:

```bash
SPEAKER_EMBEDDER_URL=http://localhost:5000/embed
```

## Endpoints

| Endpoint   | Method | Description |
|-----------|--------|-------------|
| `/health` | GET    | Model status |
| `/embed`  | POST   | Body: raw WAV or raw PCM 16kHz mono (or multipart `audio` file). Returns `{ "embedding": [float, ...] }` (192 dims). |
| `/verify` | POST   | Form: `audio1`, `audio2` files. Returns `{ "same_speaker": bool, "score": float }`. |

## Audio format

- **Preferred:** WAV, 16 kHz, mono. The pipeline stores per-speaker slices; for best results upload **WAV 16 kHz mono** in the app so slices are valid.
- Raw PCM (16-bit mono) at 16 kHz is also accepted.
- Other formats may work if `soundfile` can read them (e.g. FLAC). Resampling to 16 kHz is done automatically.

## GPU

If you have CUDA, the model will use GPU automatically. Otherwise it runs on CPU (slower but fine for small batches).
