# Voice pipeline: OpenAI diarization + speaker clustering

## Architecture (Layer 1–3)

1. **Layer 1 – Diarization (speaker turns)**  
   **OpenAI `gpt-4o-transcribe-diarize`** returns segments with local speaker labels (e.g. `S0`, `S1` or `A`, `B`) and timestamps. One API call gives both transcript and who spoke when inside that clip.

2. **Layer 2 – Cross-episode speaker identity**  
   We do **not** use Azure Speaker Recognition (retired; and it’s for “which of these enrolled speakers?”, not open-world discovery).  
   Instead:
   - For each diarized speaker segment we compute a **speaker embedding** (voiceprint vector).
   - **Online clustering**: match new embeddings to existing speaker centroids (cosine similarity); if above threshold, assign to that speaker; else create a new speaker.
   - Centroids are updated with an exponential moving average (EMA) as we see more segments.
   - Optional: user can **name** a speaker (e.g. “Roommate”, “Mom”) via `PATCH /api/voice/speakers`.

3. **Layer 3 – Conversation grouping**  
   Chunks can be grouped into conversations by silence gap (`CONVO_GAP_MS`). Right now single-upload flow creates one chunk = one conversation.

## Data model (file-based under `data/voice/`)

- **Chunks**: `data/voice/chunks/{id}.json` (metadata) + `data/voice/chunks/audio/{id}.wav` (audio).
- **Conversations**: `data/voice/conversations/default/{id}.json` with `chunk_ids`.
- **Transcript segments**: `data/voice/segments/{conversationId}_{chunkId}.json` with `speaker_local`, `speaker_global_id`, `start_ms`, `end_ms`, `text`.
- **Speakers**: `data/voice/speakers/default.json` – list of `{ id, user_id, display_name, centroid, last_seen_at }`.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voice/ingest` | POST | Upload audio (formData `audio`). Creates chunk + one conversation. Returns `chunkId`, `conversationId`. |
| `/api/voice/processOpenAI` | POST | Run full pipeline. Either JSON `{ conversationId }` or formData `audio`. Returns `segments` (with `speaker_global_id`, `speaker_display_name`), `speakers`, `speakersCreated`. |
| `/api/voice/speakers` | GET | List speakers. PATCH body `{ speakerId, display_name }` to name a speaker. |
| `/api/voice/conversations/by-speaker?speakerId=...` | GET | List conversation IDs that include this speaker (for "all conversations with this person"). |
| `/api/voice/embedder-status` | GET | `{ configured, ok, model? }` — whether embedder is set and reachable (for UI). |

## Env

- **OPENAI_API_KEY** – required for transcription + diarization.
- **SPEAKER_EMBEDDER_URL** – optional. If set, POST audio bytes to this URL; expect `{ embedding: number[] }`. If unset, a placeholder embedding is used so clustering runs for testing.
- **SPEAKER_MATCH_THRESHOLD** – cosine similarity threshold (default `0.72`).
- **CONVO_GAP_MS** – gap in ms to start a new conversation (default 10 min).

## Speaker embedding (production): SpeechBrain ECAPA-TDNN

For real voice recognition and grouping by profile we use **SpeechBrain ECAPA-TDNN** (pretrained `speechbrain/spkrec-ecapa-voxceleb`, 192-d embeddings). See [Speaker embedding analysis](speaker-embedding-analysis.md) for ECAPA vs pyannote and why this is recommended.

1. **Run the embedder service** (Python):
   ```bash
   cd services/speaker_embedder && pip install -r requirements.txt && uvicorn app:app --host 0.0.0.0 --port 5000
   ```
2. In `.env.local` set **SPEAKER_EMBEDDER_URL=http://localhost:5000/embed**.
3. For best results, upload **WAV 16 kHz mono** in the Voice tab so per-speaker slices are valid for the model.

The service exposes:
- **POST /embed** – body: raw WAV or PCM → `{ "embedding": [float, ...] }`
- **POST /verify** – two audio files → `{ "same_speaker": bool, "score": float }`

## Privacy / product

- Recording and identifying people has consent and legal implications. Prefer:
  - Obvious “recording on” indicator.
  - Per-conversation or per-session consent.
  - Retention limits and optional on-device redaction.
