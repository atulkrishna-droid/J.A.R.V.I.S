# AI integration

## Default provider

`src/config.ts` defaults `VITE_BACKEND` to `ollama`. `src/lib/brain.ts` forwards prompts to `src/lib/bridge.ts`, which communicates with the Ollama bridge at `ws://localhost:8787`. The Node bridge binds to loopback and calls Ollama at `http://127.0.0.1:11434` unless `OLLAMA_HOST` is set.

## Model discovery and primary model

The bridge reads installed tags from Ollama `/api/tags`. It selects, in order: a configured `OLLAMA_MODEL` if installed; a model name matching Qwen and 14B; any Qwen model; otherwise the first listed model. The bridge does not pull models on startup.

## Routing

Routing is a keyword heuristic, and specialist selection is based on model-name patterns:

| Role | Prompt cues | Model-name match |
|---|---|---|
| Vision | image, screenshot, photo, picture, vision | `llava`, `vision`, `qwen.*vl` |
| Coding | code, Python, JavaScript, TypeScript, debug, compile, function, class | `coder`, `code`, `deepseek-coder` |
| Reasoning | prove, derive, complex, deep think, reasoning, math, equation | `reason`, `deepseek-r1`, `qwq` |
| Research | document, PDF, research, knowledge, file, notes | `embed`, `bge`, `nomic` |
| General | otherwise | Qwen model |

If a non-vision specialist is not found, the primary model is used and the bridge reports fallback metadata. Image attachments are rejected unless the selected route is vision-capable. The research role is not a retrieval system: no document index or RAG pipeline is implemented. Because its matcher includes embedding model names, verify candidate models before relying on that route; embedding-only models are not chat models.

## Streaming and context

The bridge sends `stream: true` to Ollama `/api/chat` and forwards each text delta over its WebSocket. It sends at most the last 24 prior messages and currently sets `options.num_ctx` to 4096. This value is fixed in source, not an environment setting.

## Optional legacy providers

- `VITE_BACKEND=bridge` selects the Claude Agent SDK bridge, which uses Claude CLI/account state and MCP servers from Claude configuration.
- `VITE_BACKEND=direct` uses the legacy browser Anthropic client. Its API key is included in the frontend environment and is exposed to the browser; use only for local experimentation.

These providers are separate from local Ollama inference and may use network services.

## Voice and vision

Local desktop STT requires `whisper-cli`, `ffmpeg`, and a readable model file set by `WHISPER_MODEL`. Local TTS requires `piper` and a readable model file set by `PIPER_MODEL`. Missing voice dependencies do not prevent text chat. Vision support depends on an installed compatible Ollama model; no model is downloaded automatically.
