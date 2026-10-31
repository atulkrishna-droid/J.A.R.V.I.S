#!/usr/bin/env node
// JARVIS preflight — a friendly, advisory check you run with `npm run setup`.
//
// It changes nothing and installs nothing. It looks at your machine, tells you
// what is ready and what is missing, and prints the two commands that start
// JARVIS. Every check degrades to a single friendly line if something is not
// there, and the script always exits 0 — it is advice, not a gate.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const tick = '  ok  ';
const warn = ' note ';
const info = '  ·   ';

function line(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

console.log('');
console.log('JARVIS preflight — checking your machine (nothing is changed)');
console.log('------------------------------------------------------------');

let backend = 'ollama';
try {
  const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  backend = envText.match(/^\s*VITE_BACKEND\s*=\s*["']?([^"'\s#]+)/m)?.[1] ?? backend;
} catch { /* .env.local is optional. */ }

// --- Node version --------------------------------------------------------
try {
  const major = Number(process.versions.node.split('.')[0]);
  if (Number.isFinite(major) && major >= 20) {
    line(tick, `Node.js ${process.versions.node} (20+ required).`);
  } else {
    line(warn, `Node.js ${process.versions.node} is below 20. Please upgrade — the bridge needs Node 20 or newer.`);
  }
} catch {
  line(warn, 'Could not read the Node.js version. JARVIS needs Node 20 or newer.');
}

// --- Claude CLI on PATH ---------------------------------------------------
let claudeFound = false;
try {
  const res = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (res.status === 0 && res.stdout) {
    claudeFound = true;
    line(tick, `Claude CLI found: ${res.stdout.trim()}`);
  }
} catch {
  // ignore — handled below
}
if (!claudeFound && backend === 'bridge') {
  line(warn, 'Claude CLI not found on your PATH.');
  line(info, 'Install it: npm install -g @anthropic-ai/claude-code');
  line(info, '  (or the platform installer at https://docs.claude.com/en/docs/claude-code)');
  line(info, 'Then run `claude` once and complete login. The bridge uses that login — no API key needed.');
}

if (backend === 'ollama') {
  line(info, 'Claude Agent SDK integration is preserved but is not used by the local Ollama provider.');
}

// --- ~/.claude.json and MCP servers --------------------------------------
const claudeJsonPath = join(homedir(), '.claude.json');
let mcpCount = 0;
try {
  const raw = readFileSync(claudeJsonPath, 'utf8');
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const servers = parsed && typeof parsed.mcpServers === 'object' && parsed.mcpServers ? parsed.mcpServers : {};
  mcpCount = Object.keys(servers).length;
  if (mcpCount > 0) {
    line(tick, `~/.claude.json found with ${mcpCount} MCP server${mcpCount === 1 ? '' : 's'} configured.`);
  } else {
    line(info, '~/.claude.json found, but no MCP servers are configured yet. JARVIS still answers and drives its own interface.');
  }
} catch {
  line(info, '~/.claude.json not found yet. It appears once you run `claude` and log in. JARVIS works without any MCP servers.');
}

// --- ElevenLabs key (env or the elevenlabs MCP entry) --------------------
function findElevenLabsKey() {
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim()) {
    return 'environment (ELEVENLABS_API_KEY)';
  }
  try {
    const raw = readFileSync(claudeJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const servers = parsed && parsed.mcpServers ? parsed.mcpServers : {};
    const el = servers.elevenlabs;
    const env = el && el.env ? el.env : {};
    if (env.ELEVENLABS_API_KEY && String(env.ELEVENLABS_API_KEY).trim()) {
      return 'the elevenlabs MCP server in ~/.claude.json';
    }
  } catch {
    // ignore — no key discoverable
  }
  return null;
}

const elSource = findElevenLabsKey();
if (elSource && backend !== 'ollama') {
  line(tick, `Premium voice available — ElevenLabs key found via ${elSource}.`);
} else if (backend !== 'ollama') {
  line(info, 'No ElevenLabs key found — JARVIS will use browser speech (that is completely fine).');
  line(info, '  Optional: add ELEVENLABS_API_KEY for a better voice and Scribe transcription. The free tier is enough for a demo.');
}

// --- Local Ollama ---------------------------------------------------------
if (backend === 'ollama') {
  try {
    const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    const response = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const names = (data.models ?? []).map((model) => model.name);
    const qwen = names.find((name) => /qwen.*14b|14b.*qwen/i.test(name)) ?? names.find((name) => /qwen/i.test(name));
    if (qwen) line(tick, `Ollama is available. Local Qwen model detected: ${qwen}.`);
    else line(warn, `Ollama is available but no Qwen model was found (${names.join(', ') || 'no models installed'}). No model will be downloaded automatically.`);
  } catch (error) {
    line(warn, `Ollama is not responding at ${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'} (${error.message}).`);
    line(info, 'Start Ollama before opening a chat. The app will not download a model automatically.');
  }
  const rust = spawnSync('rustc', ['--version'], { encoding: 'utf8' });
  if (rust.status === 0) line(tick, `Rust toolchain found: ${rust.stdout.trim()}.`);
  else line(warn, 'Rust/Cargo is missing. Tauri desktop builds need the stable Rust toolchain and Pop!_OS WebKitGTK build libraries.');
  if (backend === 'ollama') {
    const cli = spawnSync('tauri', ['--version'], { encoding: 'utf8' });
    if (cli.status === 0) line(tick, `Tauri CLI found: ${(cli.stdout || cli.stderr).trim()}.`);
    else line(warn, 'Tauri CLI is not installed. Install @tauri-apps/cli before building the native desktop packages.');
  }
}

// --- How to run ----------------------------------------------------------
console.log('');
if (backend === 'ollama') {
  console.log('To run the local desktop app:');
  console.log('  ./start-local-jarvis.sh');
  console.log('');
  console.log('For development, use `npm run desktop:dev`; production builds use `npm run desktop:build`.');
} else {
  console.log('To run the existing browser build, open two terminals:');
  console.log('  1)  npm run bridge      # Claude Code, headless');
  console.log('  2)  npm run dev         # frontend dev server');
  console.log('');
  console.log('Then open the printed URL in Chrome or Edge and click INITIALISE.');
  console.log('To enable effectful actions, read decideTool() and run `npm run bridge:writes`.');
}
console.log('');

process.exit(0);
