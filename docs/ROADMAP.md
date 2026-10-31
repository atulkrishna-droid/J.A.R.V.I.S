# Roadmap and status

This roadmap describes the inspected source tree, not promises or completed release criteria.

## Present in source

- React desktop shell and original Three.js/GLSL browser interface.
- Local Ollama bridge with model discovery, heuristic routing, streamed chat, and model operations.
- User-confirmed model deletion and download UI.
- LocalStorage conversation persistence and explicit file/project/screenshot input.
- Local CPU/RAM metrics and optional NVIDIA metrics.
- Optional Whisper/Piper endpoints.
- Tauri 2 shell and AppImage/`.deb` target configuration.
- Optional Claude Agent SDK bridge and a default-deny effectful-tool policy.
- Ollama routing unit tests and setup preflight.

## Partial or unverified

- Tauri development launch and Linux packaging; toolchain/build dependencies are not present in the inspected environment.
- Live Ollama inference, exact model identity, GPU metrics, local Whisper, and Piper availability are machine-dependent and were not verified by source inspection alone.
- Task routing is keyword/model-name matching; not a robust intent classifier.
- Research is a role label, not implemented document search/RAG.
- Conversation storage is browser/WebView localStorage only.
- Test coverage is limited to routing and does not validate desktop lifecycle, UI flows, or real inference.
- Tray, startup integration, and native notification support are not implemented in the inspected Tauri source.

## Candidate next work

1. Verify and document a reproducible Tauri build on Pop!_OS.
2. Exercise Ollama health, streaming, model selection, and supported image input on the target machine.
3. Add bridge protocol tests and UI-level tests without replacing existing tests.
4. Review the 4096-token context setting and add explicit configuration if needed.
5. Improve route behavior for research and embeddings; add retrieval only with explicit local storage and file-permission design.
6. Review Tauri CSP, bridge request authorization, and model management endpoints.
7. Test optional voice workflows with real Whisper/Piper models and document setup.

No release dates or version milestones are assigned here.
