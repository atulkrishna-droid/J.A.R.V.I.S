# Technology stack

| Technology | Use in this project |
|---|---|
| React 19 | UI components and application views |
| TypeScript | Frontend type checking |
| Vite 8 | Development server and production frontend bundling |
| Three.js | 3D rendering for the original holographic interface |
| React Three Fiber / Drei | React bindings and helpers for Three.js |
| GLSL / React Three postprocessing | Custom visual effects in the original scene |
| Zustand | State store for the original interface |
| Node.js 20+ | Local bridge, startup, and setup scripts |
| `ws` | WebSocket server used by local and legacy bridges |
| Ollama | Local model discovery and inference API |
| Tauri 2 / Rust | Native desktop window, lifecycle, and Linux packaging scaffold |
| DOMPurify | Sanitization support in the original browser UI |
| MediaPipe Tasks Vision | Hand tracking in the original interface |
| Porcupine Web / Web Voice Processor | Optional wake-word path in the original interface |
| Kokoro JS | Optional browser neural speech path |
| Anthropic SDKs | Optional legacy direct and Claude Agent SDK integrations |
| Oxlint | Configured lint command |
| Node test runner | Current Ollama routing unit tests |

The exact versions are maintained in `package.json` and `package-lock.json`. Tauri CLI, Rust/Cargo, and the native Linux build packages are not currently declared as an installed local build environment; see `INSTALL-DESKTOP.md`.
