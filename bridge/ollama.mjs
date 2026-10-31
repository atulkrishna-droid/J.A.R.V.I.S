/** Local Ollama bridge for the desktop build.
 *
 * This is deliberately separate from server.mjs: Claude Code and all of its
 * MCP integrations remain available as an optional provider, while the local
 * app can run without an Anthropic account or network connection.
 */
import { createServer } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { cpus, totalmem, freemem } from 'node:os'
import { pathToFileURL } from 'node:url'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.JARVIS_BRIDGE_PORT ?? 8787)
const OLLAMA_URL = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
const configuredModel = process.env.OLLAMA_MODEL?.trim() || ''
const LOCAL_ORIGINS = new Set([
  'tauri://localhost', 'https://tauri.localhost', 'http://tauri.localhost',
])
const modelsCache = { at: 0, value: [] }
const execFileAsync = promisify(execFile)
let previousCpu = cpus().map((cpu) => cpu.times)

function cpuPercent() {
  const now = cpus().map((cpu) => cpu.times)
  let idle = 0, total = 0
  now.forEach((times, index) => {
    const before = previousCpu[index] ?? times
    const dIdle = times.idle - before.idle
    const dTotal = Object.keys(times).reduce((sum, key) => sum + times[key] - before[key], 0)
    idle += dIdle; total += dTotal
  })
  previousCpu = now
  return total ? Math.round((1 - idle / total) * 100) : 0
}

function allowedOrigin(origin) {
  if (!origin) return true // Native local clients and the startup health check.
  if (LOCAL_ORIGINS.has(origin)) return true
  return /^http:\/\/(localhost|127\.0\.0\.1):(517[3-9]|518\d|519\d|417\d|418\d|419\d)$/.test(origin)
}

async function readJson(req, limit = 16_384) {
  let body = ''
  for await (const chunk of req) {
    body += chunk.toString()
    if (body.length > limit) throw new Error('Request body is too large.')
  }
  return JSON.parse(body || '{}')
}

async function installedModels(force = false) {
  if (!force && Date.now() - modelsCache.at < 5000) return modelsCache.value
  const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`)
  const data = await res.json()
  modelsCache.value = Array.isArray(data.models) ? data.models : []
  modelsCache.at = Date.now()
  return modelsCache.value
}

export function primaryModel(models, configured = configuredModel) {
  const names = models.map((model) => model.name)
  if (configured && names.includes(configured)) return configured
  return names.find((name) => /qwen.*14b|14b.*qwen/i.test(name))
    ?? names.find((name) => /qwen/i.test(name))
    ?? names[0]
    ?? null
}

export function routeModel(prompt, models, primary, requested = '', requestedRole = '') {
  const text = prompt.toLowerCase()
  let role = /\b(image|screenshot|photo|picture|vision)\b/.test(text) ? 'vision'
    : /\b(code|coding|python|javascript|typescript|debug|compile|function|class)\b/.test(text) ? 'coding'
      : /\b(prove|derive|complex|deep think|reasoning|math|equation)\b/.test(text) ? 'reasoning'
        : /\b(document|pdf|research|knowledge|file|notes)\b/.test(text) ? 'research'
          : 'general'
  const patterns = {
    coding: /coder|code|deepseek-coder/i,
    reasoning: /reason|deepseek-r1|qwq/i,
    vision: /llava|vision|qwen.*vl/i,
    research: /embed|bge|nomic/i,
    general: /qwen/i,
  }
  const available = models.map((model) => model.name)
  const forcedRole = { code: 'coding', reason: 'reasoning' }[requestedRole] ?? requestedRole
  if (['coding', 'reasoning', 'vision', 'research', 'general'].includes(forcedRole)) role = forcedRole
  if (requested === 'auto') requested = ''
  if (requested && available.includes(requested)) return { role, model: requested, fallback: false }
  const specialist = available.find((name) => patterns[role].test(name))
  return { role, model: specialist ?? primary, fallback: role !== 'general' && !specialist }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (!allowedOrigin(origin)) { res.writeHead(403).end('Origin is not allowed'); return }
  res.setHeader('Access-Control-Allow-Origin', origin ?? 'tauri://localhost')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  try {
    if (req.method === 'GET' && req.url === '/health') {
      try {
        const models = await installedModels(true)
        const model = primaryModel(models)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, provider: 'ollama', model, models, stt: false, tts: false }))
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, provider: 'ollama', model: null, models: [], stt: false, tts: false, error: error.message }))
      }
      return
    }
    if (req.method === 'GET' && req.url === '/models') {
      const models = await installedModels(true)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ models, defaultModel: primaryModel(models) }))
      return
    }
    if (req.method === 'GET' && req.url === '/voice') {
      const hasProgram = async (program) => execFileAsync('which', [program], { timeout: 1000 }).then(() => true).catch(() => false)
      const [whisperProgram, ffmpegProgram, piperProgram] = await Promise.all([hasProgram('whisper-cli'), hasProgram('ffmpeg'), hasProgram('piper')])
      const whisperModel = process.env.WHISPER_MODEL ?? ''
      const piperModel = process.env.PIPER_MODEL ?? ''
      const [whisperFile, piperFile] = await Promise.all([
        whisperModel ? access(whisperModel).then(() => true).catch(() => false) : false,
        piperModel ? access(piperModel).then(() => true).catch(() => false) : false,
      ])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ stt: whisperProgram && ffmpegProgram && whisperFile, tts: piperProgram && piperFile }))
      return
    }
    if (req.method === 'POST' && req.url === '/voice/transcribe') {
      const { audioBase64 } = await readJson(req, 24 * 1024 * 1024)
      if (!process.env.WHISPER_MODEL) throw new Error('Set WHISPER_MODEL to an installed local Whisper model file first.')
      await access(process.env.WHISPER_MODEL)
      if (typeof audioBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(audioBase64)) throw new Error('The audio payload is invalid.')
      const audio = Buffer.from(audioBase64, 'base64')
      if (!audio.length || audio.length > 16 * 1024 * 1024) throw new Error('Audio must be smaller than 16 MB.')
      const dir = await mkdtemp(join(tmpdir(), 'jarvis-whisper-'))
      try {
        const input = join(dir, 'capture.webm'), wav = join(dir, 'capture.wav'), output = join(dir, 'transcript')
        await writeFile(input, audio)
        await execFileAsync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', input, '-ar', '16000', '-ac', '1', wav], { timeout: 15_000 })
        await execFileAsync('whisper-cli', ['-m', process.env.WHISPER_MODEL, '-f', wav, '-nt', '-np', '-otxt', '-of', output], { timeout: 120_000, maxBuffer: 1024 * 1024 })
        const transcript = await readFile(`${output}.txt`, 'utf8').catch(() => '')
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ text: transcript.trim() }))
      } finally { await rm(dir, { recursive: true, force: true }) }
      return
    }
    if (req.method === 'POST' && req.url === '/voice/speak') {
      const { text } = await readJson(req, 64 * 1024)
      if (!process.env.PIPER_MODEL) throw new Error('Set PIPER_MODEL to an installed local Piper voice file first.')
      await access(process.env.PIPER_MODEL)
      if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('Speech text must be 1–4000 characters.')
      const dir = await mkdtemp(join(tmpdir(), 'jarvis-piper-'))
      try {
        const output = join(dir, 'speech.wav')
        await new Promise((resolve, reject) => {
          const child = spawn('piper', ['--model', process.env.PIPER_MODEL, '--output_file', output], { stdio: ['pipe', 'ignore', 'pipe'] })
          let stderr = ''
          child.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(0, 4000) })
          child.on('error', reject)
          child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `Piper exited with ${code}`)))
          child.stdin.end(text)
        })
        const wav = await readFile(output)
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length }).end(wav)
      } finally { await rm(dir, { recursive: true, force: true }) }
      return
    }
    if (req.method === 'GET' && req.url === '/system') {
      let gpu = null
      try {
        const { stdout } = await execFileAsync('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 1500 })
        const [utilization, used, total] = stdout.trim().split(',').map((value) => Number(value.trim()))
        if ([utilization, used, total].every(Number.isFinite)) gpu = { utilization, vramUsed: used, vramTotal: total }
      } catch { /* Integrated graphics or an unavailable NVIDIA driver. */ }
      let loaded = []
      try {
        const res = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(1200) })
        if (res.ok) loaded = (await res.json()).models ?? []
      } catch { /* The primary health endpoint reports Ollama availability. */ }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ cpu: cpuPercent(), ramUsed: totalmem() - freemem(), ramTotal: totalmem(), gpu, loaded }))
      return
    }
    if (req.method === 'POST' && req.url === '/models/load') {
      const { model } = await readJson(req)
      const installed = await installedModels(true)
      if (typeof model !== 'string' || !installed.some((entry) => entry.name === model)) throw new Error('Choose an installed model to load.')
      const result = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '5m' }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      })
      if (!result.ok) throw new Error(`Ollama could not load the model (HTTP ${result.status}).`)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method === 'POST' && req.url === '/models/unload') {
      const { model } = await readJson(req)
      const installed = await installedModels(true)
      if (typeof model !== 'string' || !installed.some((entry) => entry.name === model)) throw new Error('Choose an installed model to unload.')
      const result = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!result.ok) throw new Error(`Ollama could not unload the model (HTTP ${result.status}).`)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method === 'POST' && req.url === '/models/delete') {
      const { model } = await readJson(req)
      const installed = await installedModels(true)
      if (typeof model !== 'string' || !installed.some((entry) => entry.name === model)) throw new Error('Choose an installed model to delete.')
      const result = await fetch(`${OLLAMA_URL}/api/delete`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!result.ok) throw new Error(`Ollama could not delete the model (HTTP ${result.status}).`)
      modelsCache.at = 0
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method === 'POST' && req.url === '/models/pull') {
      const { model } = await readJson(req)
      if (typeof model !== 'string' || !/^[\w./:-]{1,120}$/.test(model)) throw new Error('Enter a valid Ollama model tag.')
      const result = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true }), signal: AbortSignal.timeout(60 * 60 * 1000),
      })
      if (!result.ok) throw new Error(`Ollama could not install that model (HTTP ${result.status}).`)
      let last = 'Downloading model'
      for await (const chunk of result.body) {
        const rows = chunk.toString().split('\n').filter(Boolean)
        for (const row of rows) { const status = JSON.parse(row); if (status.status) last = status.status }
      }
      modelsCache.at = 0
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, status: last }))
      return
    }
    res.writeHead(404).end('Not found')
  } catch (error) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: error.message }))
  }
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 20 * 1024 * 1024 })
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin
  if (origin && !allowedOrigin(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return
  }
  if (!origin && process.env.JARVIS_ALLOW_NO_ORIGIN !== '1') {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
})

wss.on('connection', (socket) => {
  const systemMessage = { role: 'system', content: 'You are J.A.R.V.I.S., a concise and helpful local desktop assistant. All inference runs locally through Ollama. Do not claim to have taken an action unless a tool actually did it.' }
  let messages = [systemMessage]
  let controller = null
  const send = (frame) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame)) }
  send({ type: 'ready', servers: [] })

  socket.on('message', async (raw) => {
    let frame
    try { frame = JSON.parse(raw.toString()) } catch { return }
    if (frame.type === 'interrupt') { controller?.abort(); return }
    if (frame.type !== 'ask' || typeof frame.text !== 'string') return
    controller?.abort()
    controller = new AbortController()
    const activeController = controller
    const askId = typeof frame.id === 'string' ? frame.id : null
    const sendTurn = (event) => send({ ...event, ask: askId })
    try {
      const models = await installedModels(true)
      const primary = primaryModel(models)
      if (!primary) throw new Error('No Ollama models are installed. Install or select your Qwen model in Ollama first.')
      const attachments = Array.isArray(frame.attachments) ? frame.attachments.filter((image) => typeof image === 'string' && image.length <= 12 * 1024 * 1024).slice(0, 4) : []
      const route = routeModel(frame.text, models, primary, frame.model ?? '', attachments.length ? 'vision' : frame.role ?? '')
      if (attachments.length && !/vision|llava|qwen.*vl/i.test(route.model ?? '')) {
        throw new Error('No compatible installed vision model is selected. Image data was not sent to a text-only model.')
      }
      const content = frame.text
      const prior = Array.isArray(frame.history) ? frame.history.slice(-24)
        .filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string')
        .map((item) => ({ role: item.role, content: item.content.slice(0, 30000) })) : []
      messages = [systemMessage, ...prior]
      messages.push({ role: 'user', content, ...(attachments.length ? { images: attachments } : {}) })
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: route.model, messages, stream: true, keep_alive: '5m', options: { num_ctx: 4096 } }),
        signal: activeController.signal,
      })
      if (!response.ok) throw new Error(`Ollama chat failed (HTTP ${response.status})`)
      let lineBuffer = '', answer = ''
      for await (const chunk of response.body) {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const item = JSON.parse(line)
          const delta = item.message?.content ?? ''
          if (delta) { answer += delta; sendTurn({ type: 'text', delta }) }
          if (item.done) break
        }
      }
      if (answer) messages.push({ role: 'assistant', content: answer })
      sendTurn({ type: 'done', text: answer, model: route.model, role: route.role, fallback: route.fallback })
    } catch (error) {
      if (error.name !== 'AbortError') sendTurn({ type: 'error', message: error.message || 'The local model could not answer.' })
      else sendTurn({ type: 'done', text: '' })
    }
  })
  socket.on('close', () => controller?.abort())
})

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[jarvis] local Ollama bridge listening at 127.0.0.1:${PORT}`)
    console.log(`[jarvis] Ollama endpoint ${OLLAMA_URL}; model ${configuredModel || 'auto-detect Qwen 14B'}`)
  })
}

function shutdown() {
  for (const client of wss.clients) client.close(1001, 'JARVIS shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}
if (isMain) {
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
