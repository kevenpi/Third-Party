# Speaker recognition: ECAPA-TDNN vs pyannote — analysis and recommendation

## What you need for “recognize voices, group by profile, store by person”

1. **Diarization** – “Who spoke when?” (segments with labels S0, S1, …).  
   **Already in place:** OpenAI `gpt-4o-transcribe-diarize`.

2. **Speaker embeddings** – A fixed-size vector per voice (voiceprint) so you can compare “is this the same person?” across clips.  
   **Currently:** Placeholder. For real recognition you need a real embedder.

3. **Clustering / profiles** – Match new embeddings to existing speakers (cosine similarity + centroid), create new speaker profiles when no match.  
   **Already in place:** `speakerClustering.ts` + `speakerStorage.ts`.

4. **Storing by person** – Every transcript segment has `speaker_global_id`; list “all conversations where this speaker appeared” and optionally show “all lines by this person.”  
   **Already in place:** segments and speakers in `data/voice/`; one extra API to list conversations by speaker is useful.

So the only missing piece for **full** functionality is a **real speaker embedder** that turns audio into a 192‑dim (or similar) vector. Two main options: **SpeechBrain ECAPA-TDNN** and **pyannote**.

---

## Option A: SpeechBrain ECAPA-TDNN (recommended)

**What it is**

- Pretrained **ECAPA-TDNN** from [SpeechBrain](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb): `speechbrain/spkrec-ecapa-voxceleb`.
- Trained on VoxCeleb1+2; **EER 0.80%** on VoxCeleb1-test (cleaned).
- One model does:
  - **Embeddings:** `EncoderClassifier.from_hparams(...)` → `encode_batch(signal)` → 192‑dim vector.
  - **Verification:** `SpeakerRecognition.from_hparams(...)` → `verify_files(file1, file2)` → same/different speaker + score.

**Pros**

- **Fits our pipeline:** We already have diarization (OpenAI). We only need “audio → embedding.” SpeechBrain gives exactly that with a few lines.
- **No extra accounts:** Public Hugging Face model, no API token required for the model itself.
- **Simple API:** Load model once, `encode_batch(wav_tensor)` → return list of floats. Easy to wrap in a small HTTP service.
- **Verification built-in:** Optional “are these two clips the same speaker?” without touching our clustering.
- **Well documented:** [Speaker verification with ECAPA-TDNN](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb) and SpeechBrain tutorials.

**Cons**

- You run a **Python service** (e.g. FastAPI) that loads the model and exposes `/embed` (and optionally `/verify`). Not a single Node app.
- **Input:** 16 kHz mono. Our pipeline can send per-speaker slices; if your ingest is already 16 kHz mono (or you convert once), you’re good.

**Summary:** Best fit for “recognize different voices and group people by profile” when you already have diarization: add a small Python service that returns ECAPA-TDNN embeddings and optionally verification; keep the rest of the pipeline as-is.

---

## Option B: pyannote.audio

**What it is**

- [pyannote.audio](https://github.com/pyannote/pyannote-audio): diarization + speaker embedding + clustering in one ecosystem.
- “Who spoke when” + optional speaker embeddings; some models need a **Hugging Face token** (and acceptance of the model terms).
- Premium/cloud options (e.g. precision-2) add voiceprinting, speaker ID, etc.

**Pros**

- **All-in-one:** Diarization + embeddings + clustering in one framework. Could replace OpenAI diarization + our clustering if you wanted a single stack.
- **State-of-the-art diarization** on many benchmarks.
- **Flexible:** Multiple models and pipelines.

**Cons**

- **Heavier:** Full diarization pipeline when we only need “audio → embedding” for already-diarized segments.
- **Terms/token:** Some models require Hugging Face token and accepting the model card.
- **Integration:** We’d either (a) use pyannote only for embeddings (then similar to SpeechBrain: run a Python service, call it from Node) or (b) replace OpenAI + our clustering with pyannote end-to-end (more refactor).

**Summary:** Great if you want to standardize on pyannote for everything. For “keep OpenAI diarization, add real embeddings and profiles,” it’s more than we need; SpeechBrain is simpler.

---

## Option C: TaoRuijie/ECAPA-TDNN (training repo)

**What it is**

- [TaoRuijie/ECAPA-TDNN](https://github.com/TaoRuijie/ECAPA-TDNN): **training** code (PyTorch, VoxCeleb, loss, etc.). Not a ready “load and encode” API.
- You’d have to train or export a model, then write inference + HTTP yourself.

**Verdict:** Not needed. Use the **pretrained** SpeechBrain ECAPA-TDNN model instead; no training, same architecture family.

---

## Recommendation: SpeechBrain ECAPA-TDNN as embedder service

- **Use:** SpeechBrain **spkrec-ecapa-voxceleb** in a small **Python HTTP service** that:
  - **POST /embed** – body: raw WAV (or multipart file) 16 kHz mono → response: `{ "embedding": [float, ...] }` (192 dims).
  - **POST /verify** (optional) – two WAVs → `{ "same_speaker": bool, "score": float }`.
- **Keep:** OpenAI for transcription + diarization; existing Node clustering and storage.
- **Set:** `SPEAKER_EMBEDDER_URL=http://localhost:5000/embed` (or your deploy URL) so the Node app calls this service instead of the placeholder.

Result:

- **Different voices** → different embeddings → different `speaker_global_id` (new profiles when below threshold).
- **Same person across clips** → similar embeddings → matched to same profile (centroid updated).
- **Naming:** `PATCH /api/voice/speakers` with `display_name` to label “Speaker 3” as “Mom,” etc.
- **Storing by person:** Segments already have `speaker_global_id`; add an API “list conversations for speaker X” and “list segments for speaker X” to fully support “conversations by individuals.”

---

## What’s implemented in this repo

- **Analysis (this doc):** ECAPA vs pyannote vs training repo; recommendation = SpeechBrain ECAPA as embedder.
- **Python embedder service:** `services/speaker_embedder/` – FastAPI app, SpeechBrain `spkrec-ecapa-voxceleb`, `/embed` and `/verify`, 16 kHz mono input.
- **Node:** Already calls `SPEAKER_EMBEDDER_URL` for embeddings; clustering and storage by `speaker_global_id` unchanged.
- **API:** Optional `GET /api/voice/conversations/by-speaker?speakerId=...` to list conversations per person (and thus “store / categorize conversations by individuals”).
