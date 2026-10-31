# Development guide

## Requirements

- Node.js 20+ and npm.
- Ollama with at least one installed chat model for local chat.
- For native development/build: stable Rust/Cargo, Tauri CLI, build-essential, WebKitGTK 4.1 development libraries, pkg-config, OpenSSL development files, and other packages listed in `INSTALL-DESKTOP.md`.
- Optional voice binaries and local models: `whisper-cli`, `ffmpeg`, `piper`, a Whisper model file, and a Piper voice model.

## Install dependencies

```bash
npm install
npm run setup
```

`npm run setup` is an advisory preflight and does not install dependencies. Do not run `npm install` casually when working on a dirty lockfile; inspect the lockfile diff first.

## Run locally

Desktop launcher:

```bash
npm start
```

Local Ollama web development uses two terminals:

```bash
# Terminal 1
npm run bridge:ollama

# Terminal 2
npm run dev
```

Native development requires the Tauri CLI and system prerequisites:

```bash
npm run desktop:dev
```

The legacy browser provider is separate. It uses `npm run bridge` plus the Vite frontend configured with `VITE_BACKEND=bridge`; its Claude CLI, MCP, and account requirements are described in source and `docs/SECURITY.md`.

## Checks

```bash
npm run build
npm run lint
npm run test:local
npm run setup
```

Native package build:

```bash
npm run desktop:build
```

That command also needs the Tauri CLI, Rust, WebKitGTK, and packaging tools. Tests currently cover heuristic model selection/routing only. Do not describe the suite as validating microphone, inference, Tauri launch, or packaging.

## Environment variables

`VITE_*` values are frontend build/dev variables read by Vite. Bridge values are read from the process environment. The Node bridges do not parse `.env.local`.

| Variable | Consumer | Purpose |
|---|---|---|
| `VITE_BACKEND` | Frontend | `ollama` (default), `bridge`, or `direct` |
| `VITE_BRIDGE_URL` | Frontend | WebSocket bridge base URL; HTTP endpoints derive from it |
| `VITE_DESKTOP_SHELL` | Entry point | Set to `false` to show the old `App` instead of `Desktop` |
| `VITE_TTS_ENGINE` | Legacy frontend | `system` or optional `kokoro` |
| `VITE_KOKORO_VOICE` | Legacy frontend | One of `bm_george`, `bm_fable`, `bm_lewis`, `bm_daniel` |
| `VITE_USE_ELEVENLABS` | Legacy frontend | Toggle browser use of ElevenLabs when configured |
| `VITE_ANTHROPIC_API_KEY` | Direct frontend | Browser-side Anthropic API key; unsafe for shared deployments |
| `VITE_ELEVENLABS_API_KEY`, `VITE_ELEVENLABS_VOICE_ID`, `VITE_PICOVOICE_ACCESS_KEY` | Legacy frontend | Optional third-party voice/wake-word settings |
| `JARVIS_BRIDGE_PORT` | Both bridges | Local bridge port (default 8787) |
| `OLLAMA_HOST` | Ollama bridge | Ollama API base (default `http://127.0.0.1:11434`) |
| `OLLAMA_MODEL` | Ollama bridge | Optional exact installed model tag |
| `WHISPER_MODEL` | Ollama bridge | Local Whisper model file path |
| `PIPER_MODEL` | Ollama bridge | Local Piper voice model path |
| `JARVIS_ALLOW_WRITES` | Legacy bridge | Allows selected effectful tools when `1`; default is off |
| `JARVIS_ALLOWED_ORIGINS` | Legacy bridge | Additional allowed browser origins |
| `JARVIS_ALLOW_NO_ORIGIN` | Both bridges | Allows originless connections when `1` |
| `JARVIS_FILE_ROOTS` | Legacy bridge | Extra roots for its file-serving endpoint |
| `JARVIS_MODEL`, `JARVIS_EFFORT` | Legacy bridge | Claude model and effort |
| `ELEVENLABS_API_KEY`, `JARVIS_VOICE_ID` | Legacy bridge | Optional remote TTS/STT configuration |
| `JARVIS_DEBUG` | Legacy bridge | Enables verbose SDK event logging when `1` |
| `PORT` | Vite | Development server port |

See `.env.example` for safe blank examples. Never put actual credentials in a committed file.

## Contribution workflow

1. Read root `AGENTS.md` and inspect `git status` before touching files.
2. Keep changes scoped; preserve all existing work and inspect diffs before staging.
3. Add or update focused tests for behavior changes.
4. Run checks relevant to the changed code and report unavailable checks honestly.
5. Review secret exposure, local network binding, and documentation before staging.
6. Do not commit or push unless explicitly requested and approved.
