# Project overview

## Vision

J.A.R.V.I.S. is a personal assistant with a cinematic holographic interface and a local-first desktop direction. The current tree combines an established browser experience with newer work for a Tauri 2 desktop shell and an Ollama-backed local assistant.

## Objectives

- Keep chat and model inference local through an Ollama endpoint on loopback by default.
- Reuse the React/Three.js interface work while adding a native Linux application shell.
- Make model availability and optional speech capabilities visible to the user.
- Preserve the legacy Claude Agent SDK bridge as an optional provider.
- Keep local actions constrained and avoid unrestricted shell execution in the Ollama path.

## Current features in source

- React desktop shell with Dashboard, Chat, Models, Agents, Voice, Memory, Tools, Files, System, and Settings views.
- Holographic reactor and the original Three.js/GLSL scene remain in the browser UI.
- Local Ollama model discovery, streaming chat, simple task-role heuristics, and explicit model selection.
- Model load/unload/delete/download controls. Download and delete require UI confirmation.
- Chat transcript persistence in browser/WebView local storage.
- User-selected file attachments, bounded text excerpts from a chosen project folder, and browser/WebView screen capture.
- CPU/RAM reporting from Node and optional NVIDIA GPU/VRAM reporting through `nvidia-smi`.
- Optional local Whisper.cpp transcription and Piper speech output, if binaries and model paths are supplied.
- Tauri 2 configuration for AppImage and Debian package targets.
- Legacy browser voice interaction, UI panels, tool integration, and optional Claude Agent SDK backend.

## Current development status

The Tauri shell, Ollama bridge, desktop UI, launcher, and routing tests are present in the working tree. They are not all committed, and native packaging has not been demonstrated on this checkout. Earlier local checks in the development session passed the frontend build and routing tests; the native package build could not run because Rust/Cargo and the Tauri CLI were missing. A live Ollama request and hardware telemetry also depend on the host service and NVIDIA driver.

## Known limitations

- The router uses keyword and model-name matching, not a learned classifier or multi-agent orchestrator.
- Ollama chat currently sets `num_ctx` to 4096 in source.
- The research role is name-matched and does not implement document indexing or RAG.
- Vision requires a compatible installed model. Text-only models are rejected for image requests.
- Voice is optional and depends on local programs and model files; these are not bundled.
- Conversation persistence is localStorage, not a database or cross-device sync service.
- The Tauri app has no verified AppImage/`.deb` output yet; tray integration and native notification support are not implemented in the inspected source.
- GPU/VRAM telemetry requires working `nvidia-smi`; values remain unavailable otherwise.

The maintained status list is [ROADMAP.md](ROADMAP.md).
