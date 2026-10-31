# J.A.R.V.I.S. — Codex project instructions

Read this file and the linked architecture documentation before making changes.

## Preserve the current project

- This is an existing project with valuable Git history and potentially user-owned uncommitted changes.
- Before edits, inspect `git status --short`, the relevant source, and current diffs. Never reset, clean, stash, discard, or replace unrelated work.
- Keep application changes incremental. Do not recreate the repository or replace working code with placeholders.
- Do not modify application behavior during documentation or repository-preparation tasks unless explicitly asked.

## Architecture map

- `src/main.tsx`: selects the desktop shell (`src/Desktop.tsx`) or the legacy app (`src/App.tsx`, when `VITE_DESKTOP_SHELL=false`).
- `src/Desktop.tsx`, `src/desktop.css`: local Ollama-oriented desktop interface, chat state, model status, local attachments, and optional voice UI.
- `src/scene/`, `src/ui/`, `src/store.ts`: original Three.js/GLSL holographic interface, panels, voice state, and controls.
- `src/lib/brain.ts`: selects the configured AI backend.
- `src/lib/bridge.ts`: client protocol for the optional Claude bridge.
- `src/lib/anthropic.ts`: direct Anthropic path.
- `bridge/ollama.mjs`: loopback Node bridge to Ollama, with model routing, streaming, status, and optional local voice endpoints.
- `bridge/server.mjs` and sibling `bridge/*.mjs`: optional Claude Agent SDK bridge, MCP integrations, legacy HTTP proxies, and UI tools.
- `src-tauri/`: Tauri 2 configuration, Rust startup/shutdown handling, capabilities, and icons.
- `scripts/`: setup and launch helpers.
- `test/`: Node tests for local routing.
- `public/audio/`: required project tracks with attribution in `public/audio/CREDITS.md`.

See `docs/ARCHITECTURE.md`, `docs/API_REFERENCE.md`, and `docs/AI_INTEGRATION.md` for details.

## Runtime and configuration

- Default frontend provider is local Ollama (`VITE_BACKEND=ollama`). It calls the Node bridge, which calls Ollama on `127.0.0.1:11434`.
- The bridge defaults to port `8787` and binds to loopback. Do not expose it publicly or add an unauthenticated remote listener.
- The router is a heuristic over prompt keywords and installed model names; do not describe it as a trained classifier.
- The current Ollama chat path sets `num_ctx: 4096` in source.
- Local STT/TTS require configured Whisper/Piper model files and local programs. Keep text chat working without them.
- The optional `bridge` provider uses Claude Agent SDK and MCP configuration. The `direct` provider exposes its Vite API key to browser code and must not be treated as secure for shared deployment.
- Vite reads `VITE_*` from `.env.local`; Node bridge variables are read from the process environment. Do not assume the bridge loads `.env.local`.
- Never print or commit secrets. Keep `.env.example` limited to empty placeholders.

## Commands

```bash
npm start                 # desktop launcher
npm run bridge:ollama     # local Ollama bridge
npm run dev               # Vite development server
npm run desktop:dev       # Tauri development window (requires CLI/toolchain)
npm run build             # TypeScript + frontend build
npm run desktop:build     # frontend + AppImage/deb build (requires native toolchain)
npm run lint
npm run test:local
npm run setup             # advisory, read-only preflight
```

For a browser session with local Ollama, run `npm run bridge:ollama` and `npm run dev` in separate terminals. See `INSTALL-DESKTOP.md` for Pop!_OS prerequisites.

## Change and verification workflow

1. Trace the relevant execution path before editing and identify which backend is active.
2. Prefer targeted patches; avoid duplicate services, unnecessary dependency changes, and schema changes.
3. Add or update focused tests for changed routing or protocol behavior.
4. Run the relevant build, lint, test, and setup checks. Run the native build when its prerequisites are present.
5. Report tests by exact command and result. Do not claim live Ollama, GPU, voice, or Tauri verification unless executed successfully.
6. Review the final diff for accidental secrets, API keys, generated output, lockfile churn, and unrelated changes.

## Git workflow

- Preserve all existing changes and commits.
- Do not stage or commit unrelated files. Review staged and unstaged diffs separately.
- Never force-push, rewrite history, or replace a configured remote.
- Ask the user before creating a repository, committing, or pushing when the task requires approval.

## Documentation maintenance

Update relevant pages in `docs/`, `README.md`, `INSTALL-DESKTOP.md`, `.env.example`, and this file when implementation or requirements change. Keep `docs/API_REFERENCE.md` tied to routes and message types actually present in source. Mark planned or unverified behavior clearly.
