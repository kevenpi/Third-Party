<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1DJ979D7Ucu0LFvesk0BmPB6v0cUHUOVE

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

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
