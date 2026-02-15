# ThirdParty

ThirdParty is a relationship mirror and guided journaling app for TreeHacks 2026.

## Stack

- Next.js 14 App Router
- TypeScript
- Anthropic SDK + strict JSON validation with zod
- Local JSON storage in `data/`

## Quick start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and set at least:

   - `OPENAI_API_KEY=sk-...` (required for Voice tab transcription + diarization)
   - `ANTHROPIC_API_KEY=...` (for mediator/reflections; optional)

   Never commit `.env.local` or paste keys into the repo.

3. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3003](http://localhost:3003). Use the **Voice** tab to upload or record and transcribe with speaker labels.

4. **Optional: real speaker IDs (ECAPA-TDNN)**

   For persistent “who is this voice?” across sessions (not just placeholder labels):

   - Install Python 3 and pip, then run the embedder in a **second terminal**:

     ```bash
     npm run embedder
     ```

     Or manually:

     ```bash
     cd services/speaker_embedder
     pip install -r requirements.txt
     uvicorn app:app --host 0.0.0.0 --port 5000
     ```

   - In `.env.local` add (or uncomment):

     ```
     SPEAKER_EMBEDDER_URL=http://localhost:5000/embed
     ```

   - Restart `npm run dev`. The Voice page will show “ECAPA-TDNN” when the embedder is reachable.

5. **Optional: audio conversion (webm/mp3 → WAV)**

   The app uses **ffmpeg-static** (installed with `npm install`) to convert uploads to 16 kHz mono WAV for best embedder results. No separate ffmpeg install needed. If conversion fails (e.g. unsupported format), transcription still runs; speaker IDs may be less accurate without the embedder.

## Run locally (summary)

Same as Quick start above: `npm install` → copy `.env.example` to `.env.local` and set keys → `npm run dev` → optional `npm run embedder` + `SPEAKER_EMBEDDER_URL`.

## Conversation awareness and Meta glasses

The app now includes a conversation-awareness detector and recording pipeline:

- `POST /api/conversationAwareness/listen`:
  - body: `{ "listeningEnabled": true | false }`
- `GET /api/conversationAwareness/state`:
  - returns detector state, recent sessions, and recent events
- `POST /api/conversationAwareness/ingestSignal`:
  - body: `{ "source": "microphone" | "meta_glasses" | "phone_camera", "audioLevel": 0..1, "presenceScore": 0..1, "speakerHints": [{ personTag, speakingScore }] }`
- `POST /api/conversationAwareness/uploadClip`:
  - body: `{ "sessionId": "...", "audioBase64": "...", "mimeType": "audio/webm" }`
- `POST /api/metaGlasses/ingest`:
  - body: `{ "deviceId": "...", "audioLevel": 0..1, "speakerHints": [{ personTag, speakingScore }] }`

### Safety behavior

- Facial recognition is not implemented.
- Identity is based on consented person tags and speaker hints only.
- Raw captured audio is stored locally in `data/awareness/clips` and is not shared by the shared-session flow.
- Phone camera mode computes co-presence and motion scores only. It does not identify people and does not persist video frames.

## UI flow

- Go to `/timeline`
- Tap the gear icon to open `/settings`
- Start listening to activate microphone monitoring, optional phone camera co-presence monitoring, and detector-triggered recording
- Use the Meta glasses signal panel to ingest device-side speaker hints

## Voice: Transcribe + Speaker Identification

Two pipelines:

1. **OpenAI + speaker memory (recommended)**  
   **OpenAI `gpt-4o-transcribe-diarize`** for transcription + diarization (speaker turns). Then **speaker embeddings + clustering** (cosine similarity, centroid updates) to build persistent “who is this voice?” across sessions. No Azure Speaker Recognition; open-world discovery. See [docs/voice-pipeline.md](docs/voice-pipeline.md).

2. **Google + Azure (optional)**  
   Google Speech-to-Text for diarization; Azure Speaker Recognition to identify **enrolled** speakers only.

### Setup (OpenAI pipeline)

See **Quick start** above. In short:

1. Set **OPENAI_API_KEY** in `.env.local` (never commit it).
2. **Real speaker IDs (optional):** Run `npm run embedder` in a second terminal (or run the Python service manually; see Quick start). Set **SPEAKER_EMBEDDER_URL=http://localhost:5000/embed** in `.env.local`.  
   Details: [docs/speaker-embedding-analysis.md](docs/speaker-embedding-analysis.md).
3. **Audio conversion:** The app uses **ffmpeg-static** (installed with npm) to convert uploads to WAV 16 kHz mono; no separate ffmpeg install needed.

### Setup (Google + Azure)

1. **Google Cloud**
   - Create a project and enable the [Speech-to-Text API](https://console.cloud.google.com/apis/library/speech.googleapis.com).
   - Create a service account, download a JSON key, and set in `.env.local`:
     - `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/your-key.json`
   - Or use `gcloud auth application-default login` and set `GOOGLE_CLOUD_PROJECT=your-project-id`.

2. **Azure**
   - Create a [Speech resource](https://portal.azure.com) and in `.env.local` set:
     - `AZURE_SPEECH_KEY=your-key`
     - `AZURE_SPEECH_REGION=westus` (or your region).

3. Copy [.env.example](.env.example) to `.env.local` and fill in the keys.

### Flow

- **Voice tab**: Choose “OpenAI + speaker memory” (default) or “Google + Azure”. Upload or record → “Transcribe & identify”. With OpenAI: segments get stable speaker IDs over time; you can name speakers via `PATCH /api/voice/speakers`. With Google+Azure: enroll people in People → person → “Enroll voice”, then transcribe to match to those enrolled.

## About

TreeHacks 2026 project
