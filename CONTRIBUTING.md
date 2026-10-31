# Contributing

Thanks for helping improve J.A.R.V.I.S. The project is evolving from a browser-based assistant toward a local-first Linux desktop app; changes should preserve both paths unless a task explicitly narrows scope.

## Before you begin

1. Read `AGENTS.md`, the relevant `docs/` pages, and the implementation around the code you plan to change.
2. Run `git status --short`. Preserve existing staged, modified, and untracked files; never reset, clean, or overwrite unrelated work.
3. Confirm whether the change applies to the Ollama desktop backend, the legacy Claude bridge, or both.

## Development standards

- Prefer small, focused changes that reuse existing services and interfaces.
- Keep Ollama inference local and the bridge bound to loopback.
- Do not add unrestricted shell execution or silently enable effectful tools.
- Ask before adding large model downloads, secret-bearing integrations, destructive model actions, or external network exposure.
- Keep credentials out of source, documentation examples, logs, screenshots, and tests.
- Add tests for behavior changes where practical. Do not claim UI, native packaging, GPU, voice, or live-model validation unless those checks actually ran.
- Keep documentation and `.env.example` aligned with code and keep the example free of credentials.

## Checks

Run the relevant commands and include their actual results in the change summary:

```bash
npm run build
npm run lint
npm run test:local
npm run setup
```

For changes to the native shell, also run `npm run desktop:build` where Tauri, Rust, and the Linux build libraries are available. Report missing prerequisites rather than substituting an unverified result.

## Git and review

- Work on a focused branch when preparing a change for publication.
- Review `git diff` and `git diff --cached` before staging or committing.
- Do not rewrite history or force-push.
- Do not commit or push without the repository owner's approval.
- Include a concise summary, tests actually run, and known limitations.

## License and assets

The repository contains an MIT license and separate audio attribution terms. Ensure new assets have compatible rights and include any required attribution.
