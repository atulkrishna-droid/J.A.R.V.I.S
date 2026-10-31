# Security notes

## Secrets

- Never commit `.env.local`, API keys, OAuth tokens, private keys, account exports, or machine-specific configuration.
- `.env.example` contains empty placeholders only.
- `VITE_ANTHROPIC_API_KEY` is a client-side Vite variable and is bundled into JavaScript. Do not use it in public/shared deployments.
- Legacy Claude and ElevenLabs paths may read credentials from environment variables or local Claude MCP configuration. Do not print or commit those values.

## Local service exposure

- The Ollama bridge explicitly binds to `127.0.0.1:8787`; Ollama defaults to `127.0.0.1:11434`.
- The Ollama bridge has no authentication. Origin checks help browsers but are not an authentication mechanism for local programs. Its model endpoints can load, unload, pull, or delete local models.
- Do not reverse-proxy or bind these services to a LAN/public interface without adding authentication, authorization, and request controls.
- The legacy server uses its own origin checks and may bind on the host's unspecified interface through `server.listen(PORT)`. Keep it off untrusted networks.

## Tool permissions

The local Ollama bridge does not expose arbitrary shell commands. Its file and screenshot flows require user selection. The optional legacy Claude bridge loads configured MCP servers and has a tool gate that denies effectful actions by default. `JARVIS_ALLOW_WRITES=1` changes that policy; review the `decideTool` implementation before enabling it.

## Browser and desktop boundaries

- The `direct` Anthropic backend sends requests from the browser and exposes its Vite key to the frontend.
- `index.html` defines a CSP for the browser build, but `src-tauri/tauri.conf.json` currently has `security.csp: null`. Review and configure Tauri CSP before treating the packaged WebView as protected by the HTML policy.
- User-selected project excerpts and attachments are placed in prompts. Select only files you intend to share with the selected provider.
- The legacy browser voice path can use browser speech recognition; the source notes that this path may use browser-provided remote speech services. The desktop local Whisper/Piper path is optional and requires local assets.

## Supply chain and assets

- Review dependency and lockfile changes before accepting package updates.
- `public/audio/` contains licensed music with attribution requirements documented in `public/audio/CREDITS.md`.
- Preserve the existing MIT license and verify rights for any added media, fonts, icons, and screenshots.

## Reporting

Do not put secrets or personal account data in bug reports. Include sanitized logs, reproduction steps, and relevant version information.
