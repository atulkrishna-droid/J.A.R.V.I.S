#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OLLAMA_URL="${OLLAMA_HOST:-http://127.0.0.1:11434}"
OLLAMA_PID=""
APP_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill -TERM "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [[ -n "$OLLAMA_PID" ]] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
    kill -TERM "$OLLAMA_PID" 2>/dev/null || true
    wait "$OLLAMA_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

command -v node >/dev/null || { echo "Node.js is required to run the local bridge." >&2; exit 1; }
command -v ollama >/dev/null || { echo "Ollama is not installed or is missing from PATH." >&2; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 20 )) || { echo "Node.js 20 or newer is required (found $(node --version))." >&2; exit 1; }

if ! node -e 'fetch(process.argv[1]+"/api/tags",{signal:AbortSignal.timeout(1200)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' "$OLLAMA_URL"; then
  echo "Ollama is not responding; starting one local Ollama service."
  ollama serve >/dev/null 2>&1 &
  OLLAMA_PID=$!
  for _ in {1..30}; do
    if node -e 'fetch(process.argv[1]+"/api/tags",{signal:AbortSignal.timeout(800)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' "$OLLAMA_URL"; then break; fi
    sleep 1
  done
fi

MODEL_SUMMARY="$(node -e 'fetch(process.argv[1]+"/api/tags").then(r=>r.json()).then(x=>{const m=(x.models||[]).map(v=>v.name); const q=m.find(n=>/qwen.*14b|14b.*qwen/i.test(n))||m.find(n=>/qwen/i.test(n)); if(!q){console.error("No Qwen model is installed. Existing local models: "+(m.join(", ")||"none")); process.exit(2)} console.log(q) }).catch(e=>{console.error(e.message);process.exit(1)})' "$OLLAMA_URL")" || {
  echo "Could not verify a locally installed Qwen model. No model was downloaded." >&2
  exit 1
}
echo "Using installed local model: $MODEL_SUMMARY"

cd "$PROJECT_DIR"
APPIMAGE="$(find src-tauri/target/release/bundle/appimage -maxdepth 1 -type f -name '*.AppImage' -print -quit 2>/dev/null || true)"
if [[ -n "$APPIMAGE" ]]; then
  chmod +x "$APPIMAGE"
  "$APPIMAGE" & APP_PID=$!
  wait "$APP_PID"
else
  command -v tauri >/dev/null || { echo "Tauri CLI is missing. Install it with: npm install --save-dev @tauri-apps/cli@^2" >&2; exit 1; }
  echo "No AppImage build found. Starting the Tauri development desktop window."
  npm run desktop:dev & APP_PID=$!
  wait "$APP_PID"
fi
