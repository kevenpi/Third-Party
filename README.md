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
  - body: `{ "source": "microphone" | "meta_glasses", "audioLevel": 0..1, "speakerHints": [{ personTag, speakingScore }] }`
- `POST /api/conversationAwareness/uploadClip`:
  - body: `{ "sessionId": "...", "audioBase64": "...", "mimeType": "audio/webm" }`
- `POST /api/metaGlasses/ingest`:
  - body: `{ "deviceId": "...", "audioLevel": 0..1, "speakerHints": [{ personTag, speakingScore }] }`

### Safety behavior

- Facial recognition is not implemented.
- Identity is based on consented person tags and speaker hints only.
- Raw captured audio is stored locally in `data/awareness/clips` and is not shared by the shared-session flow.

## UI flow

- Go to `/timeline`
- Tap the gear icon to open `/settings`
- Start listening to activate microphone monitoring and detector-triggered recording
- Use the Meta glasses signal panel to ingest device-side speaker hints
