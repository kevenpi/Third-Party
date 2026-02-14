# ThirdParty

ThirdParty is a relationship mirror and guided journaling app for TreeHacks 2026.

## Stack

- Next.js 14 App Router
- TypeScript
- Anthropic SDK + strict JSON validation with zod
- Local JSON storage in `data/`

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your_key
CLAUDE_MODEL=claude-3-5-sonnet-latest
GEMINI_API_KEY=your_gemini_key
```

3. Run dev server:

```bash
npm run dev
```

4. Open [http://localhost:3003](http://localhost:3003)

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

The app can transcribe audio with **speaker diarization** (who said what) and optionally **identify speakers** by voice:

- **Google Cloud Speech-to-Text**: diarization (labels “Speaker 1”, “Speaker 2”, etc.).
- **Azure AI Speech – Speaker Recognition**: identify which speaker is which enrolled person.

### Setup

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

- **Enroll**: People → open a person → “Enroll voice”. Record or upload WAV (16 kHz, 16-bit, mono recommended). Enrolled profiles are stored in the browser (localStorage).
- **Transcribe & identify**: Voice tab → upload or record → “Transcribe & identify”. Uses Google for diarization and Azure to map speakers to enrolled people when available.

## About

TreeHacks 2026 project
