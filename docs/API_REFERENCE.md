# API reference

This document describes the application-owned bridge interfaces found in the current source. Requests are local-only by intended binding; there is no authentication layer.

## Ollama desktop bridge

Default HTTP and WebSocket address: `127.0.0.1:8787`. The server permits the configured local Tauri and Vite origins. The WebSocket refuses originless clients unless `JARVIS_ALLOW_NO_ORIGIN=1`.

### HTTP endpoints

| Method / path | Request | Response / behavior |
|---|---|---|
| `GET /health` | none | JSON with `ok`, `provider`, selected `model`, installed `models`, and optional voice flags; service errors are returned in the JSON body |
| `GET /models` | none | `{ models, defaultModel }` from Ollama model tags |
| `GET /system` | none | CPU, RAM, optional NVIDIA GPU/VRAM, and currently loaded Ollama models |
| `GET /voice` | none | `{ stt, tts }` capability flags based on programs and configured model files |
| `POST /voice/transcribe` | `{ "audioBase64": "..." }` | `{ "text": "..." }`; temporary audio is converted with ffmpeg and transcribed locally |
| `POST /voice/speak` | `{ "text": "..." }` | WAV audio from local Piper |
| `POST /models/load` | `{ "model": "installed-tag" }` | Loads an installed model via Ollama and returns `{ "ok": true }` |
| `POST /models/unload` | `{ "model": "installed-tag" }` | Unloads a model via Ollama and returns `{ "ok": true }` |
| `POST /models/delete` | `{ "model": "installed-tag" }` | Deletes an installed local model; the UI asks for confirmation |
| `POST /models/pull` | `{ "model": "registry-tag" }` | Pulls a model from Ollama; the UI asks for confirmation and no pull occurs automatically |

Errors generally return JSON `{ ok: false, error }` with a 503 response. Request sizes are bounded in the implementation. Do not expose this unauthenticated bridge beyond loopback.

### WebSocket protocol

Connect to `ws://127.0.0.1:8787/` with an allowed Origin.

Client frames:

```json
{"type":"ask","id":"turn-id","text":"Question","history":[],"model":"auto","role":"general","attachments":[]}
{"type":"interrupt"}
```

`history`, `model`, `role`, and base64 image `attachments` are optional. Server events include `ready`, `text` (`delta`), `done` (text, model, role, fallback), and `error` (message). An interrupt aborts the current request.

The desktop bridge calls Ollama's `/api/tags`, `/api/ps`, `/api/chat`, `/api/generate`, `/api/delete`, and `/api/pull` internally. Those are Ollama endpoints, not additional J.A.R.V.I.S. routes.

## Legacy Claude bridge

The optional `bridge/server.mjs` listens on port 8787 by default, uses WebSocket `/` or `/ws`, and exposes HTTP endpoints:

| Method / path | Purpose |
|---|---|
| `GET /health` | Reports legacy voice capability flags |
| `GET /file?path=...` | Serves supported image files within configured roots |
| `GET /img?url=...` | Proxies bounded remote images with destination checks |
| `GET /media?url=...` | Proxies bounded remote audio/video with range handling |
| `GET /page?url=...&mode=reader\|live` | Fetches and sanitizes a web page for iframe display |
| `POST /tts` | Optional ElevenLabs speech endpoint; JSON `{ "text": "..." }` |
| `POST /stt` | Optional ElevenLabs transcription endpoint; raw audio body |

Its WebSocket accepts `ask`, `interrupt`, and tool `reply` frames. It emits events such as `ready`, streamed `text`, `tool`, `panel`, `blade`, `ui`, `done`, and `error`. It is a distinct backend with separate security and account requirements; see [SECURITY.md](SECURITY.md).
