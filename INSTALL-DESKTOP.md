# J.A.R.V.I.S. Desktop on Pop!_OS

The desktop build keeps the existing React, Three.js and GLSL interface, adds a
Tauri 2 window, and uses a local Node bridge to stream chat from Ollama. The
existing Claude Agent SDK bridge remains in `bridge/server.mjs` as an optional
provider. The local Ollama bridge never pulls a model automatically.

## Prerequisites

Node.js 20 or newer, Ollama, and the desired local model must already be
installed. The desktop packages require Rust/Cargo, the Tauri CLI, and Linux
WebKitGTK build libraries. To install the system build libraries on Pop!_OS:

```bash
sudo apt update
sudo apt install -y build-essential curl file libayatana-appindicator3-dev \
  libssl-dev libwebkit2gtk-4.1-dev librsvg2-dev patchelf pkg-config
```

The first command installs the Linux compiler and WebKitGTK development files
Tauri needs to build the native window and `.deb`/AppImage packages. Install
stable Rust only if `rustc --version` or `cargo --version` is missing:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup default stable
```

The Tauri CLI drives `tauri dev` and `tauri build`; install it once dependencies
can be downloaded:

```bash
cd ~/jarvis
npm install --save-dev @tauri-apps/cli@^2
```

This CLI dependency should be recorded in `package-lock.json` by npm. The local
checkout already contains an unrelated lockfile edit, so review the resulting
lockfile diff before committing it.

## Verify local AI

Run `ollama list` and confirm the intended Qwen model is installed. The bridge
prefers an installed Qwen 14B tag, then another Qwen tag, then the first
installed model. To pin the exact tag, set `OLLAMA_MODEL` in the environment
that starts J.A.R.V.I.S. No specialist model is downloaded for routing.

## Run and build

```bash
cd ~/jarvis
npm install
npm run setup
./start-local-jarvis.sh
```

The startup script only starts `ollama serve` if the Ollama HTTP API is not
already responding. The Tauri process owns the local bridge lifecycle and
shuts it down on exit. It launches a built AppImage when present; otherwise it
uses the Tauri development window.

Build native packages with:

```bash
npm run desktop:build
```

Tauri writes the AppImage and Debian package under
`src-tauri/target/release/bundle/`. The Debian package creates the application
launcher entry through Tauri's Linux bundler. Install and remove it with:

```bash
sudo apt install ./src-tauri/target/release/bundle/deb/*.deb
sudo apt remove jarvis-desktop
```

## Local data and limitations

The desktop shell saves chat transcripts in the application WebView's local
storage. Model discovery and routing use Ollama's loopback API. CPU and RAM
metrics are collected locally; GPU and VRAM figures require a working NVIDIA
driver and `nvidia-smi`. Local voice requires `whisper-cli`, `ffmpeg`, and a
local Whisper model configured with `WHISPER_MODEL`; speech output requires
Piper and a local voice model configured with `PIPER_MODEL`. These remain
optional. Document indexing is not enabled, and the assistant has no arbitrary
shell execution path.
