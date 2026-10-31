import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ask, cancel, warm, type AskHandlers } from './lib/brain'
import { BRIDGE_HTTP_URL } from './config'
import './desktop.css'

type Message = { id: string; role: 'user' | 'assistant'; content: string; model?: string }
type Thread = { id: string; title: string; updatedAt: number; messages: Message[] }
type Model = { name: string; size?: number; details?: { parameter_size?: string; family?: string } }
type Health = { ok: boolean; provider?: string; model?: string | null; models?: Model[]; error?: string }
type System = { cpu: number; ramUsed: number; ramTotal: number; gpu?: { utilization: number; vramUsed: number; vramTotal: number } | null; loaded: Array<{ name: string; size_vram?: number }> }
type Voice = { stt: boolean; tts: boolean }

const NAV = [
  ['Chat', '▤'], ['Dashboard', '⌂'], ['Agents', '⌘'], ['Models', '⬡'], ['Voice', '◖'],
  ['Memory', '▥'], ['Tools', '⚒'], ['Files', '▱'], ['System', '▣'], ['Settings', '⚙'],
] as const
const THREAD_KEY = 'jarvis.desktop.threads.v1'
const THREAD_ACTIVE_KEY = 'jarvis.desktop.active.v1'
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const formatBytes = (value?: number) => {
  if (!value) return '—'
  const gb = value / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(value / 1024 ** 2).toFixed(0)} MB`
}

function safeThreads(): Thread[] {
  try {
    const value = JSON.parse(localStorage.getItem(THREAD_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((thread) => Array.isArray(thread.messages)) : []
  } catch { return [] }
}

function tauriWindow(action: 'minimize' | 'toggleMaximize' | 'close' | 'toggleFullscreen') {
  const api = (window as unknown as { __TAURI__?: { window?: { getCurrentWindow?: () => { minimize?: () => Promise<void>; toggleMaximize?: () => Promise<void>; close?: () => Promise<void>; isFullscreen?: () => Promise<boolean>; setFullscreen?: (value: boolean) => Promise<void> } } }).__TAURI__
  const current = api?.window?.getCurrentWindow?.()
  if (action === 'toggleFullscreen') { void current?.isFullscreen?.().then((full) => current.setFullscreen?.(!full)); return }
  void current?.[action]?.()
}

export default function Desktop() {
  const [section, setSection] = useState('Dashboard')
  const [threads, setThreads] = useState<Thread[]>(safeThreads)
  const [activeId, setActiveId] = useState(() => localStorage.getItem(THREAD_ACTIVE_KEY) ?? '')
  const [health, setHealth] = useState<Health>({ ok: false })
  const [system, setSystem] = useState<System | null>(null)
  const [voice, setVoice] = useState<Voice>({ stt: false, tts: false })
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('jarvis.desktop.model') ?? 'auto')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('Auto')
  const [attachment, setAttachment] = useState<{ name: string; text?: string; image?: string } | null>(null)
  const [projectContext, setProjectContext] = useState('')
  const [projectLabel, setProjectLabel] = useState('')
  const [recording, setRecording] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('jarvis.desktop.reducedMotion') === 'true')
  const filePicker = useRef<HTMLInputElement>(null)
  const folderPicker = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const recordTimer = useRef<number | null>(null)
  const spokenAudio = useRef<HTMLAudioElement | null>(null)

  const active = useMemo(() => threads.find((thread) => thread.id === activeId), [threads, activeId])
  const persist = useCallback((next: Thread[]) => {
    setThreads(next)
    localStorage.setItem(THREAD_KEY, JSON.stringify(next.slice(-60)))
  }, [])

  const refresh = useCallback(async () => {
    const result = (url: string) => fetch(`${BRIDGE_HTTP_URL}${url}`, { signal: AbortSignal.timeout(2500) })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
        return data
      })
    const [h, m, s, v] = await Promise.allSettled([result('/health'), result('/models'), result('/system'), result('/voice')])
    if (h.status === 'fulfilled') setHealth(h.value)
    else setHealth({ ok: false, error: 'Local Ollama bridge is offline' })
    if (m.status === 'fulfilled') {
      setModels(m.value.models ?? [])
      if (selectedModel !== 'auto' && !(m.value.models ?? []).some((model: Model) => model.name === selectedModel)) setSelectedModel('auto')
    } else setModels([])
    if (s.status === 'fulfilled') setSystem(s.value)
    if (v.status === 'fulfilled') setVoice(v.value)
    setError('')
  }, [selectedModel])

  useEffect(() => { void warm().catch(() => {}); void refresh(); const timer = window.setInterval(() => void refresh(), 5000); folderPicker.current?.setAttribute('webkitdirectory', ''); return () => { clearInterval(timer); recorder.current?.stream.getTracks().forEach((track) => track.stop()); if (recordTimer.current) clearTimeout(recordTimer.current); spokenAudio.current?.pause() } }, [refresh])
  useEffect(() => { if (activeId) localStorage.setItem(THREAD_ACTIVE_KEY, activeId) }, [activeId])
  useEffect(() => { localStorage.setItem('jarvis.desktop.model', selectedModel) }, [selectedModel])
  useEffect(() => { localStorage.setItem('jarvis.desktop.reducedMotion', String(reducedMotion)); document.documentElement.classList.toggle('reduced-motion', reducedMotion) }, [reducedMotion])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); newChat() } if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); tauriWindow('toggleFullscreen') } if (event.key === 'Escape' && section === 'Chat') setSection('Dashboard') }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [section, threads])

  function newChat() {
    const thread: Thread = { id: id(), title: 'New conversation', updatedAt: Date.now(), messages: [] }
    persist([thread, ...threads]); setActiveId(thread.id); setSection('Chat'); setError('')
  }

  async function sendMessage(raw = draft) {
    const prompt = raw.trim()
    if (!prompt || busy) return
    if (attachment?.image && (!models.some((item) => /vision|llava|qwen.*vl/i.test(item.name)) || (selectedModel !== 'auto' && !/vision|llava|qwen.*vl/i.test(selectedModel)))) {
      setError('Select an installed vision model before attaching images. This request will not be sent to a text-only model.')
      return
    }
    let thread = active
    if (!thread) {
      thread = { id: id(), title: prompt.slice(0, 42), updatedAt: Date.now(), messages: [] }
      setActiveId(thread.id)
    }
    const requestText = `${prompt}${attachment?.text ? `\n\nSelected file: ${attachment.name}\n${attachment.text.slice(0, 24000)}` : ''}${projectContext ? `\n\nSelected project context (read-only excerpts):\n${projectContext}` : ''}`
    const userMessage: Message = { id: id(), role: 'user', content: `${requestText}${attachment?.image ? `\n\n[Image attached: ${attachment.name}]` : ''}` }
    const assistantId = id()
    const initial = { ...thread, title: thread.messages.length ? thread.title : prompt.slice(0, 42), updatedAt: Date.now(), messages: [...thread.messages, userMessage, { id: assistantId, role: 'assistant' as const, content: '' }] }
    persist([initial, ...threads.filter((item) => item.id !== initial.id)])
    setDraft(''); setBusy(true); setError('')
    let answer = ''
    const handlers: AskHandlers = {
      onText(delta) {
        answer += delta
        setThreads((current) => {
          const next = current.map((item) => item.id !== initial.id ? item : { ...item, updatedAt: Date.now(), messages: item.messages.map((message) => message.id === assistantId ? { ...message, content: answer } : message) })
          localStorage.setItem(THREAD_KEY, JSON.stringify(next.slice(-60)))
          return next
        })
      },
      onTool() {},
    }
    try {
      const history = thread.messages.map(({ role, content }) => ({ role, content }))
      const result = await ask(requestText, history, handlers, selectedModel === 'auto' ? undefined : selectedModel, mode.toLowerCase(), attachment?.image ? [attachment.image] : [])
      setThreads((current) => {
          const label = result.model ? `${result.model}${result.fallback ? ` · fallback (${result.role})` : ''}` : undefined
          const next = current.map((item) => item.id !== initial.id ? item : { ...item, messages: item.messages.map((message) => message.id === assistantId ? { ...message, content: answer || result.text, model: label } : message) })
        localStorage.setItem(THREAD_KEY, JSON.stringify(next.slice(-60)))
        return next
      })
      if (voice.tts && result.text.trim()) {
        const speech = await fetch(`${BRIDGE_HTTP_URL}/voice/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: result.text.slice(0, 4000) }) })
        if (speech.ok) {
          const audioUrl = URL.createObjectURL(await speech.blob())
          const player = new Audio(audioUrl)
          spokenAudio.current = player
          player.onended = () => URL.revokeObjectURL(audioUrl)
          await player.play().catch(() => URL.revokeObjectURL(audioUrl))
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setThreads((current) => {
        const next = current.map((item) => item.id !== initial.id ? item : { ...item, messages: item.messages.filter((entry) => entry.id !== assistantId || entry.content) })
        localStorage.setItem(THREAD_KEY, JSON.stringify(next.slice(-60)))
        return next
      })
    } finally { setBusy(false); setAttachment(null) }
  }

  function openFile() { filePicker.current?.click() }
  async function receiveFile(file?: File) {
    if (!file) return
    if (file.type.startsWith('image/')) {
      if (file.size > 9 * 1024 * 1024) { setError('Choose an image smaller than 9 MB.'); return }
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Could not read the selected image.'))
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.readAsDataURL(file)
      })
      setAttachment({ name: file.name, image: encoded }); setMode('Vision'); setSection('Chat'); setError('')
      return
    }
    if (file.size > 1_000_000) { setError('Text attachments are limited to 1 MB.'); return }
    try { setAttachment({ name: file.name, text: await file.text() }); setError('') }
    catch { setError('Could not read the selected file.') }
  }

  async function takeScreenshot() {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is not available in this desktop runtime.')
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      stream.getTracks().forEach((track) => track.stop())
      setAttachment({ name: 'Screen capture', image: canvas.toDataURL('image/jpeg', 0.78).split(',')[1] })
      setMode('Vision'); setSection('Chat'); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Screen capture failed.') }
  }

  async function runApprovedAction() {
    const command = window.prompt('Choose a read-only action: type “ollama list” or “system status”. Arbitrary shell commands are disabled.')
    if (command === 'ollama list') {
      alert(models.length ? models.map((model) => `${model.name} · ${formatBytes(model.size)}`).join('\n') : 'No local models are installed.')
    } else if (command === 'system status') {
      alert(system ? `CPU ${system.cpu}% · RAM ${formatBytes(system.ramUsed)} / ${formatBytes(system.ramTotal)} · GPU ${system.gpu ? `${system.gpu.utilization}%` : 'unavailable'}` : 'System information is unavailable.')
    } else if (command !== null) setError('That action is not on the approved read-only list.')
  }

  function openProjectPicker() { folderPicker.current?.click() }

  async function selectProject(files: File[]) {
    const ignored = /(^|\/)(\.git|node_modules|dist|build|\.env[^/]*)($|\/)/i
    const textFile = /\.(md|txt|json|ya?ml|toml|xml|html?|css|tsx?|jsx?|py|rs|go|java|kt|sh|sql|csv|log)$/i
    let budget = 12_000
    const excerpts: string[] = []
    for (const file of files) {
      const path = file.webkitRelativePath || file.name
      if (!textFile.test(file.name) || ignored.test(path) || file.size > 128_000 || budget <= 0) continue
      try {
        const text = (await file.text()).slice(0, Math.min(3000, budget))
        if (!text.trim()) continue
        excerpts.push(`--- ${path} ---\n${text}`)
        budget -= text.length
      } catch { /* Skip unreadable or binary files. */ }
    }
    setProjectContext(excerpts.join('\n\n'))
    setProjectLabel(`${files.length} files selected · ${excerpts.length} text excerpts ready`)
    setSection('Chat')
    setError(excerpts.length ? '' : 'No supported text files were found in that project. Attach a file explicitly instead.')
  }

  async function toggleMicrophone() {
    if (recording) { recorder.current?.stop(); return }
    if (!voice.stt) { setError('Local Whisper is unavailable. Configure WHISPER_MODEL and install whisper-cli to enable microphone input.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const capture = new MediaRecorder(stream)
      audioChunks.current = []
      capture.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data) }
      capture.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop()); setRecording(false)
        if (recordTimer.current) clearTimeout(recordTimer.current)
        const blob = new Blob(audioChunks.current, { type: capture.mimeType || 'audio/webm' })
        const audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(new Error('Could not read microphone audio.'))
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
          reader.readAsDataURL(blob)
        })
        try {
          const response = await fetch(`${BRIDGE_HTTP_URL}/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioBase64 }) })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error ?? 'Local transcription failed.')
          setDraft((current) => `${current}${current ? ' ' : ''}${result.text}`)
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Local transcription failed.') }
      }
      recorder.current = capture; capture.start(); setRecording(true); setError('')
      recordTimer.current = window.setTimeout(() => { if (capture.state === 'recording') capture.stop() }, 15_000)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Microphone access was unavailable.') }
  }

  const activeModel = selectedModel === 'auto' ? (system?.loaded?.[0]?.name ?? health.model ?? null) : selectedModel
  const loaded = activeModel ? system?.loaded?.some((model) => model.name === activeModel) : false
  const title = (NAV.find(([name]) => name === section) ?? NAV[0])[0]

  return <main className="desk-shell">
    <header className="desk-topbar" data-tauri-drag-region>
      <div className="desk-brand"><span className="desk-brand-mark"><i /></span><span><b>J.A.R.V.I.S</b><small>LOCAL AI ASSISTANT</small></span></div>
      <div className="desk-mode"><span className="desk-monitor-icon">▣</span><span><b>Local Mode</b><small>{health.ok ? 'Running on this device' : 'Waiting for Ollama'}</small></span></div>
      <div className="desk-active"><span className="desk-chip-icon">✺</span><span><b>{health.model?.split(':')[0] ?? 'Qwen 14B'}</b><small>Active Model</small></span></div>
      <div className="desk-metrics">
        <Metric label="CPU" value={system ? `${system.cpu}%` : '—'} percent={system?.cpu ?? 0} />
        <Metric label="GPU" value={system?.gpu ? `${system.gpu.utilization}%` : 'N/A'} percent={system?.gpu?.utilization ?? 0} />
        <Metric label="RAM" value={system ? `${formatBytes(system.ramUsed)} / ${formatBytes(system.ramTotal)}` : '—'} percent={system ? system.ramUsed / system.ramTotal * 100 : 0} />
        <Metric label="VRAM" value={system?.gpu ? `${formatBytes(system.gpu.vramUsed * 1024 ** 2)} / ${formatBytes(system.gpu.vramTotal * 1024 ** 2)}` : 'N/A'} percent={system?.gpu ? system.gpu.vramUsed / system.gpu.vramTotal * 100 : 0} />
      </div>
      <div className="desk-clock"><b>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b><small>{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</small></div>
      <div className="desk-window-controls"><button aria-label="Toggle fullscreen (Ctrl+Shift+F)" title="Fullscreen · Ctrl+Shift+F" onClick={() => tauriWindow('toggleFullscreen')}>⛶</button><button aria-label="Minimize" onClick={() => tauriWindow('minimize')}>—</button><button aria-label="Maximize" onClick={() => tauriWindow('toggleMaximize')}>□</button><button aria-label="Close" onClick={() => tauriWindow('close')}>×</button></div>
    </header>
    <aside className="desk-sidebar">
      <nav>{NAV.map(([name, icon]) => <button key={name} className={name === section ? 'active' : ''} onClick={() => setSection(name)}><span>{icon}</span>{name}</button>)}</nav>
      <div className="desk-recent"><div className="desk-recent-heading">RECENT CHATS <button onClick={newChat} aria-label="New chat">＋</button></div>{threads.slice(0, 6).map((thread) => <button key={thread.id} className={activeId === thread.id ? 'selected' : ''} onClick={() => { setActiveId(thread.id); setSection('Chat') }}>▱<span>{thread.title || 'New conversation'}</span></button>)}{!threads.length && <small>Your chats stay on this device.</small>}</div>
      <div className="desk-sidebar-foot"><span className={health.ok ? 'status-dot good' : 'status-dot'} />{health.ok ? 'Ollama connected' : 'Ollama unavailable'}</div>
    </aside>
    <section className={`desk-main ${section === 'Chat' ? 'is-chat' : section === 'Dashboard' ? 'is-dashboard' : ''}`}>
      <div className="desk-main-title"><div><span className="eyebrow">LOCAL INTELLIGENCE</span><h1>{title}</h1></div><button className="quiet-button" onClick={() => void refresh()}>↻ &nbsp;Refresh</button></div>
      {section === 'Dashboard' && <ImmersiveDashboard
        health={health} system={system} voice={voice} models={models} threads={threads} activeModel={activeModel} selectedModel={selectedModel}
        busy={busy} recording={recording} draft={draft} attachment={attachment} mode={mode} error={error} projectLabel={projectLabel}
        setDraft={setDraft} setMode={setMode} setSection={setSection} setSelectedModel={setSelectedModel} setAttachment={setAttachment}
        sendMessage={sendMessage} openFile={openFile} takeScreenshot={takeScreenshot} toggleMicrophone={toggleMicrophone} cancel={() => { cancel(); spokenAudio.current?.pause() }}
        runApprovedAction={runApprovedAction} openProjectPicker={openProjectPicker} filePicker={filePicker} folderPicker={folderPicker} receiveFile={receiveFile} selectProject={selectProject} reducedMotion={reducedMotion} setReducedMotion={setReducedMotion}
      />}
      {section === 'Chat' && <div className="chat-layout">
        <div className={`chat-column ${busy ? 'generating' : ''}`}>
          <div className="chat-messages" key={activeId || 'empty'}>
            {!active?.messages.length ? <div className="chat-welcome"><div className={`welcome-reactor core-${recording ? 'listening' : busy ? 'thinking' : 'idle'}`}><span /><i /></div><div className="core-label">J.A.R.V.I.S. <small>LOCAL AI CORE</small></div><h2>Hello, I’m <b>J.A.R.V.I.S.</b></h2><p>Your local multi-model AI assistant</p><div className="suggestions"><button onClick={() => { setMode('Code'); void sendMessage('Help me debug a Python error') }}>⌘<b>Help me code</b><small>Debug, build or explain</small></button><button onClick={() => void sendMessage('Explain an interesting topic clearly')}>▤<b>Explain a topic</b><small>Get clear explanations</small></button><button disabled={!models.some((item) => /vision|llava|qwen.*vl/i.test(item.name))} onClick={openFile}>▧<b>Analyse an image</b><small>{models.some((item) => /vision|llava|qwen.*vl/i.test(item.name)) ? 'Attach an image' : 'Vision model unavailable'}</small></button></div></div>
              : <><div className="conversation-core"><span className={`welcome-reactor core-small core-${recording ? 'listening' : busy ? 'thinking' : 'idle'}`}><span /><i /></span><small>J.A.R.V.I.S. {busy ? 'THINKING' : 'READY'}</small></div>{active.messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><span className="message-avatar">{message.role === 'user' ? 'You' : 'J'}</span><div><small>{message.role === 'user' ? 'YOU' : `J.A.R.V.I.S${message.model ? ` · ${message.model}` : ''}`}</small><p>{message.content || (busy ? 'Thinking…' : '')}</p></div></article>)}</>}
          </div>
          <div className="chat-composer">
            {attachment && <div className="attachment-chip">▧ &nbsp;{attachment.name}<button onClick={() => setAttachment(null)} aria-label="Remove attachment">×</button></div>}
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder="Type a message, ask a question or give a command…" rows={2} />
            <div className="composer-bottom"><button className="attach-button" onClick={openFile} title="Open a file">＋</button><button className={`mic-button ${recording ? 'recording' : ''}`} onClick={() => void toggleMicrophone()} title={voice.stt ? 'Record locally with Whisper (15 second limit)' : 'Local Whisper model is not configured'}>{recording ? '■' : '♩'}</button><div className="mode-pills">{['Auto', 'Reason', 'Code', 'Vision', 'Research'].map((item) => <button key={item} className={mode === item ? 'active' : ''} disabled={item === 'Vision' && !models.some((model) => /vision|llava|qwen.*vl/i.test(model.name))} onClick={() => { setMode(item); if (item === 'Vision' && selectedModel !== 'auto' && !/vision|llava|qwen.*vl/i.test(selectedModel)) setSelectedModel('auto') }}>{item === 'Auto' ? '✧' : item === 'Code' ? '‹ ›' : '◈'} &nbsp;{item}</button>)}</div><button className="send-button" disabled={busy ? false : (!draft.trim() || !health.ok)} onClick={() => { if (busy) { cancel(); spokenAudio.current?.pause() } else void sendMessage() }}>{busy ? '■' : '➤'}</button></div>
            <input ref={filePicker} className="native-file-picker" type="file" accept="image/*,text/*,.md,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.rs,.html,.css,.toml,.yaml,.yml,.sh,.sql" onChange={(event) => { void receiveFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
            <input ref={folderPicker} className="native-file-picker" type="file" onChange={(event) => { void selectProject(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} />
          </div>
          {error && <div className="desk-error">{error}</div>}
        </div>
        <aside className="desk-inspector">
          <section className="desk-card active-model-card"><div className="card-heading">Active Model <button onClick={() => setSection('Models')}>Change</button></div><div className="active-model"><span className="model-glyph">✺</span><span><b>{activeModel ?? 'No model installed'}</b><small>{loaded ? 'Loaded in memory' : health.ok ? 'Installed · ready to load' : 'Ollama offline'}</small></span><em className={loaded ? 'loaded' : ''}>{loaded ? 'Loaded' : health.ok ? 'Ready' : 'Unavailable'}　⌄</em></div><select aria-label="Select model" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}><option value="auto">Auto · route by task</option>{models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}</select></section>
        <section className="desk-card model-selector"><div className="card-heading">Model Selector <span>{models.length} installed</span></div>{[
          ['General Assistant', health.model ?? 'Unavailable', '✺', health.model ? (system?.loaded?.some((item) => item.name === health.model) ? 'Loaded' : 'Ready') : 'Unavailable'],
          ['Coding Expert', models.find((item) => /coder|code/i.test(item.name))?.name ?? 'Primary model fallback', '⌘', models.some((item) => /coder|code/i.test(item.name)) ? 'Ready' : 'Fallback'],
          ['Deep Reasoning', models.find((item) => /reason|r1|qwq/i.test(item.name))?.name ?? 'Primary model fallback', '◈', models.some((item) => /reason|r1|qwq/i.test(item.name)) ? 'Ready' : 'Fallback'],
          ['Vision Expert', models.find((item) => /vision|llava|qwen.*vl/i.test(item.name))?.name ?? 'Unavailable', '▧', models.some((item) => /vision|llava|qwen.*vl/i.test(item.name)) ? 'Ready' : 'Unavailable'],
          ['Research Agent', models.find((item) => /research|rag/i.test(item.name))?.name ?? 'Primary model fallback', '⌕', models.some((item) => /research|rag/i.test(item.name)) ? 'Ready' : 'Fallback'],
          ['Voice Engine', voice.stt && voice.tts ? 'Whisper + Piper' : `Whisper ${voice.stt ? 'ready' : 'unavailable'} · Piper ${voice.tts ? 'ready' : 'unavailable'}`, '♫', voice.stt && voice.tts ? 'Ready' : 'Unavailable'],
        ].map(([role, model, icon, status]) => <div className="role-row" key={role}><span className="role-icon">{icon}</span><span><b>{role}</b><small>{model}</small></span><i className={status === 'Unavailable' ? 'offline' : ''}>{status}</i></div>)}</section>
          <section className="desk-card system-card"><div className="card-heading">System Status</div><Meter label="CPU" value={system ? `${system.cpu}%` : '—'} percent={system?.cpu ?? 0} /><Meter label="GPU" value={system?.gpu ? `${system.gpu.utilization}%` : 'Unavailable'} percent={system?.gpu?.utilization ?? 0} /><Meter label="RAM" value={system ? `${formatBytes(system.ramUsed)} / ${formatBytes(system.ramTotal)}` : '—'} percent={system ? system.ramUsed / system.ramTotal * 100 : 0} /><Meter label="VRAM" value={system?.gpu ? `${Math.round(system.gpu.vramUsed / 1024)} / ${Math.round(system.gpu.vramTotal / 1024)} GB` : 'Unavailable'} percent={system?.gpu ? system.gpu.vramUsed / system.gpu.vramTotal * 100 : 0} /></section>
          <section className="desk-card quick-card"><div className="card-heading">Quick Actions</div><div className="quick-grid"><button onClick={openFile}>▱ &nbsp;Open File</button><button onClick={() => void takeScreenshot()}>▧ &nbsp;Take Screenshot</button><button onClick={() => void runApprovedAction()}>⌘ &nbsp;Run Command</button><button onClick={openProjectPicker}>▣ &nbsp;Open Project</button></div>{projectLabel && <small className="project-note">{projectLabel}</small>}</section>
        </aside>
      </div>}
      {section !== 'Chat' && section !== 'Dashboard' && <SectionView section={section} threads={threads} models={models} health={health} system={system} voice={voice} onSelectModel={setSelectedModel} selectedModel={selectedModel} onRefresh={() => void refresh()} onOpenChat={() => setSection('Chat')} />}
      <footer className="desk-footer"><span>◉ &nbsp;Local device</span><span>All chat stays on this computer</span><span className={health.ok ? 'footer-online' : ''}>● &nbsp;{health.ok ? 'OLLAMA ONLINE' : 'OLLAMA OFFLINE'}</span><button onClick={() => setSection('System')}>SYSTEM MONITOR &nbsp; ↗</button></footer>
    </section>
  </main>
}

type ImmersiveProps = {
  health: Health; system: System | null; voice: Voice; models: Model[]; threads: Thread[]; activeModel: string | null; selectedModel: string
  busy: boolean; recording: boolean; draft: string; attachment: { name: string; text?: string; image?: string } | null; mode: string; error: string; projectLabel: string
  setDraft: (value: string) => void; setMode: (value: string) => void; setSection: (value: string) => void; setSelectedModel: (value: string) => void; setAttachment: (value: null) => void
  sendMessage: (raw?: string) => Promise<void>; openFile: () => void; takeScreenshot: () => Promise<void>; toggleMicrophone: () => Promise<void>; cancel: () => void
  runApprovedAction: () => Promise<void>; openProjectPicker: () => void; filePicker: React.RefObject<HTMLInputElement | null>; folderPicker: React.RefObject<HTMLInputElement | null>
  receiveFile: (file?: File) => Promise<void>; selectProject: (files: File[]) => Promise<void>; reducedMotion: boolean; setReducedMotion: (value: boolean) => void
}

function ImmersiveDashboard(p: ImmersiveProps) {
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 30_000); return () => clearInterval(timer) }, [])
  const vision = p.models.find((model) => /vision|llava|qwen.*vl/i.test(model.name))
  const roles = [
    { name: 'General Assistant', icon: '✦', model: p.health.model, state: p.health.model ? (p.system?.loaded.some((item) => item.name === p.health.model) ? 'LOADED' : 'AVAILABLE') : 'UNAVAILABLE' },
    { name: 'Coding Expert', icon: '⌘', model: p.models.find((m) => /coder|code/i.test(m.name))?.name ?? 'Primary model fallback', state: p.models.some((m) => /coder|code/i.test(m.name)) ? 'AVAILABLE' : 'FALLBACK' },
    { name: 'Deep Reasoning', icon: '◈', model: p.models.find((m) => /reason|r1|qwq/i.test(m.name))?.name ?? 'Primary model fallback', state: p.models.some((m) => /reason|r1|qwq/i.test(m.name)) ? 'AVAILABLE' : 'FALLBACK' },
    { name: 'Vision Expert', icon: '▧', model: vision?.name ?? 'Vision model not installed', state: vision ? (p.system?.loaded.some((item) => item.name === vision.name) ? 'LOADED' : 'AVAILABLE') : 'UNAVAILABLE' },
    { name: 'Research Agent', icon: '⌕', model: p.models.find((m) => /research|embed/i.test(m.name))?.name ?? 'Primary model fallback', state: p.models.some((m) => /research|embed/i.test(m.name)) ? 'AVAILABLE' : 'FALLBACK' },
    { name: 'Voice Engine', icon: '♫', model: `Whisper ${p.voice.stt ? 'on' : 'off'} · Piper ${p.voice.tts ? 'on' : 'off'}`, state: p.voice.stt || p.voice.tts ? 'AVAILABLE' : 'UNAVAILABLE' },
  ]
  const state = p.recording ? 'listening' : p.busy ? 'thinking' : 'idle'
  return <div className={`immersive-stage ${p.reducedMotion ? 'motion-off' : ''}`}>
    <div className="floating-panel left-float"><div className="float-head">ACTIVITY <span>LOCAL</span></div><div className="float-section-title">RECENT CONVERSATIONS</div>{p.threads.slice(0, 4).map((thread) => <button className="activity-row" key={thread.id} onClick={() => { p.setSection('Chat') }}><i>◌</i><span>{thread.title || 'New conversation'}<small>{thread.messages.length} messages</small></span></button>)}{!p.threads.length && <p className="float-empty">No conversations yet</p>}<div className="float-divider"/><div className="float-section-title">SYSTEM EVENTS</div><div className="activity-event"><b className={p.health.ok ? 'signal-good' : 'signal-bad'}>●</b><span>Ollama service<small>{p.health.ok ? 'Connected locally' : 'Not reachable'}</small></span></div><div className="activity-event"><b className={p.system?.gpu ? 'signal-good' : 'signal-dim'}>●</b><span>GPU telemetry<small>{p.system?.gpu ? 'NVIDIA telemetry active' : 'Driver telemetry unavailable'}</small></span></div><div className="float-section-title command-history-label">COMMAND HISTORY</div><small className="float-empty">{p.threads.flatMap((thread) => thread.messages).filter((message) => message.role === 'user').length} local prompts recorded</small></div>
    <section className="reactor-zone"><div className="reactor-readout"><span className={p.health.ok ? 'signal-good' : 'signal-bad'}>●</span> {p.health.ok ? 'LOCAL SYSTEM ONLINE' : 'LOCAL SYSTEM STANDBY'} <i/> {p.busy ? 'PROCESSING' : p.recording ? 'LISTENING' : 'IDLE'}</div><div className={`reactor-halo state-${state}`} key={p.activeModel ?? 'no-model'} aria-label={`J.A.R.V.I.S. core ${state}`}><div className="reactor-particles">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ '--i': index } as React.CSSProperties}/>)}</div><div className="reactor-orbit orbit-a"/><div className="reactor-orbit orbit-b"/><div className="reactor-orbit orbit-c"/><div className="reactor-ring ring-a"/><div className="reactor-ring ring-b"/><div className="reactor-ring ring-c"/><div className="reactor-ring ring-d"/><div className="reactor-core"><div className="reactor-core-glass"/><span>J</span><small>AI CORE</small></div><div className="reactor-pulse"/></div><div className="reactor-brand">J.A.R.V.I.S.<small>LOCAL INTELLIGENCE SYSTEM</small></div><h1>Hello, I’m <b>J.A.R.V.I.S.</b></h1><p className="reactor-subtitle">Your local multi-model AI assistant</p><div className="suggestions cinematic-suggestions"><button onClick={() => { p.setMode('Code'); void p.sendMessage('Help me debug a Python error') }}>⌘<b>Help me code</b><small>Build, debug, improve</small></button><button onClick={() => void p.sendMessage('Explain an interesting topic clearly')}>◈<b>Explain a topic</b><small>Clear, thoughtful answers</small></button><button disabled={!vision} onClick={p.openFile}>▧<b>Analyse an image</b><small>{vision ? 'Attach image for analysis' : 'No vision model available'}</small></button></div></section>
    <div className="floating-panel right-float"><div className="float-head">INTELLIGENCE MODULES <span>{p.models.length} MODELS</span></div><div className="active-module"><span className="module-emblem">✦</span><span><small>ACTIVE MODEL</small><b>{p.activeModel ?? 'No model detected'}</b><em>{p.system?.loaded.some((model) => model.name === p.activeModel) ? 'Loaded in memory' : p.health.ok ? 'Installed · ready to load' : 'Ollama offline'}</em></span><button onClick={() => p.setSection('Models')}>CHANGE</button></div><div className="module-list">{roles.map((role) => <button className={`module-row ${p.health.model === role.model && p.health.ok ? 'module-current' : ''}`} key={role.name} onClick={() => { if (p.models.some((model) => model.name === role.model)) p.setSelectedModel(role.model!); else if (role.name === 'Vision Expert' && vision) p.setSelectedModel(vision.name) }}><i>{role.icon}</i><span><b>{role.name}</b><small>{role.model ?? 'No model available'}</small></span><em className={`module-state ${role.state.toLowerCase()}`}>{role.state}</em></button>)}</div><div className="float-divider"/><div className="float-head compact-head">SYSTEM TELEMETRY <span>{p.system ? 'LIVE' : 'NO DATA'}</span></div><Meter label="CPU" value={p.system ? `${p.system.cpu}%` : 'N/A'} percent={p.system?.cpu ?? 0}/><Meter label="GPU" value={p.system?.gpu ? `${p.system.gpu.utilization}%` : 'N/A'} percent={p.system?.gpu?.utilization ?? 0}/><Meter label="RAM" value={p.system ? `${formatBytes(p.system.ramUsed)} / ${formatBytes(p.system.ramTotal)}` : 'N/A'} percent={p.system ? p.system.ramUsed / p.system.ramTotal * 100 : 0}/><Meter label="VRAM" value={p.system?.gpu ? `${formatBytes(p.system.gpu.vramUsed * 1024 ** 2)} / ${formatBytes(p.system.gpu.vramTotal * 1024 ** 2)}` : 'N/A'} percent={p.system?.gpu ? p.system.gpu.vramUsed / p.system.gpu.vramTotal * 100 : 0}/><div className="float-divider"/><div className="quick-heading">QUICK ACTIONS</div><div className="cinematic-quick"><button onClick={p.openFile}>＋ Open File</button><button onClick={() => void p.takeScreenshot()}>▧ Capture Screen</button><button onClick={() => void p.runApprovedAction()}>⌘ Read-only Command</button><button onClick={p.openProjectPicker}>▣ Open Project</button></div>{p.projectLabel && <small className="project-note">{p.projectLabel}</small>}</div>
    <div className="command-deck">{p.attachment && <div className="attachment-chip">▧ &nbsp;{p.attachment.name}<button onClick={() => p.setAttachment(null)} aria-label="Remove attachment">×</button></div>}<div className="command-entry"><button className="command-attach" onClick={p.openFile} title="Attach a file">＋</button><textarea value={p.draft} onChange={(event) => p.setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void p.sendMessage() } }} placeholder="Command J.A.R.V.I.S. ..." rows={1}/><button className={`mic-button ${p.recording ? 'recording' : ''}`} onClick={() => void p.toggleMicrophone()} title={p.voice.stt ? 'Local Whisper microphone' : 'Local Whisper unavailable'} disabled={!p.voice.stt && !p.recording}>{p.recording ? '■' : '♩'}</button><button className="send-button" disabled={p.busy ? false : (!p.draft.trim() || !p.health.ok)} onClick={() => p.busy ? p.cancel() : void p.sendMessage()}>{p.busy ? '■' : '➤'}</button></div><div className="command-meta"><div className="mode-pills">{['Auto', 'Reason', 'Code', 'Vision', 'Research'].map((item) => <button key={item} className={p.mode === item ? 'active' : ''} disabled={item === 'Vision' && !vision} onClick={() => p.setMode(item)}>{item === 'Auto' ? '✧' : item === 'Code' ? '‹ ›' : '◈'} &nbsp;{item}</button>)}</div><span>{p.busy ? 'ROUTING REQUEST · GENERATING RESPONSE' : p.recording ? 'LISTENING · SPEAK NOW' : `${p.mode.toUpperCase()} MODE · LOCAL INFERENCE`}</span></div><input ref={p.filePicker} className="native-file-picker" type="file" accept="image/*,text/*,.md,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.rs,.html,.css,.toml,.yaml,.yml,.sh,.sql" onChange={(event) => { void p.receiveFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}/><input ref={p.folderPicker} className="native-file-picker" type="file" onChange={(event) => { void p.selectProject(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }}/>{p.error && <div className="desk-error">{p.error}</div>}</div>
    <div className="immersive-bottomline"><span>◉ LOCAL ONLY</span><span>{p.health.ok ? 'OLLAMA CONNECTED' : 'OLLAMA DISCONNECTED'}</span><span>{p.activeModel ?? 'MODEL NOT DETECTED'}</span><button onClick={() => p.setSection('Chat')}>OPEN EXPANDED CHAT ↗</button><button className="motion-toggle" onClick={() => p.setReducedMotion(!p.reducedMotion)}>{p.reducedMotion ? 'MOTION OFF' : 'MOTION ON'}</button><time>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
  </div>
}

function Metric({ label, value, percent }: { label: string; value: string; percent: number }) { return <div className="top-metric"><b>{label}</b><strong>{value}</strong><span><i style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></span></div> }
function Meter({ label, value, percent }: { label: string; value: string; percent: number }) { return <div className="system-meter"><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></i><small>{value}</small></div> }

function SectionView({ section, threads, models, health, system, voice, selectedModel, onSelectModel, onRefresh, onOpenChat }: { section: string; threads: Thread[]; models: Model[]; health: Health; system: System | null; voice: Voice; selectedModel: string; onSelectModel: (model: string) => void; onRefresh: () => void; onOpenChat: () => void }) {
  const [modelTag, setModelTag] = useState('')
  const [modelBusy, setModelBusy] = useState(false)
  const [modelNotice, setModelNotice] = useState('')
  async function modelAction(action: 'load' | 'unload' | 'delete' | 'pull', model: string) {
    if ((action === 'delete' || action === 'pull') && !window.confirm(action === 'delete' ? `Delete ${model} and its local model data?` : `Download ${model} from the Ollama model registry? This may use several gigabytes of data.`)) return
    setModelBusy(true); setModelNotice(`${action === 'pull' ? 'Downloading' : action === 'delete' ? 'Deleting' : action === 'load' ? 'Loading' : 'Unloading'} ${model}…`)
    try {
      const response = await fetch(`${BRIDGE_HTTP_URL}/models/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? `Could not ${action} the model.`)
      if (action === 'delete' && selectedModel === model) onSelectModel('auto')
      setModelNotice(`${model} ${action === 'pull' ? 'downloaded' : `${action}ed`}.`)
      setModelTag('')
      onRefresh()
    } catch (error) { setModelNotice(error instanceof Error ? error.message : `Could not ${action} the model.`) }
    finally { setModelBusy(false) }
  }
  if (section === 'Models') return <div className="section-grid"><div className="desk-card wide-card"><div className="card-heading">Installed Ollama Models <button onClick={onRefresh}>Refresh</button></div>{models.length ? models.map((model) => {
    const isLoaded = system?.loaded?.some((item) => item.name === model.name) ?? false
    return <div className="installed-model" key={model.name}><span className="role-icon">✺</span><span><b>{model.name}</b><small>{model.details?.parameter_size ?? 'Local model'} · {formatBytes(model.size)} · {isLoaded ? 'Loaded' : 'Ready'}</small></span><button className={selectedModel === model.name ? 'chosen' : ''} onClick={() => onSelectModel(selectedModel === model.name ? 'auto' : model.name)}>{selectedModel === model.name ? 'Selected' : 'Select'}</button><button disabled={modelBusy} onClick={() => void modelAction(isLoaded ? 'unload' : 'load', model.name)}>{isLoaded ? 'Unload' : 'Load'}</button><button disabled={modelBusy} className="danger-button" onClick={() => void modelAction('delete', model.name)}>Delete</button></div>
  }) : <p className="muted-copy">Ollama is unavailable or no models are installed. J.A.R.V.I.S. will not download models without your approval.</p>}<form className="model-pull" onSubmit={(event) => { event.preventDefault(); if (modelTag.trim()) void modelAction('pull', modelTag.trim()) }}><input value={modelTag} onChange={(event) => setModelTag(event.target.value)} placeholder="Model tag, e.g. qwen2.5-coder:7b" /><button disabled={modelBusy || !modelTag.trim()}>Download model</button></form>{modelNotice && <p className="muted-copy" role="status">{modelNotice}</p>}</div><div className="desk-card"><div className="card-heading">Task routing</div><p className="muted-copy">Auto mode checks installed model names for coding, reasoning, vision and research specialists. If a specialist is absent, the installed Qwen model handles the request.</p><div className="tag-chip">Default · {health.model ?? 'Qwen 14B (auto-detected)'}</div></div></div>
  if (section === 'Dashboard') return <div className="section-grid"><div className="desk-card wide-card"><div className="card-heading">Local AI Core <span className={health.ok ? 'online-label' : 'offline-label'}>● &nbsp;{health.ok ? 'OPTIMAL' : 'OFFLINE'}</span></div><h2 className="section-hero">{health.model ?? 'Ollama is not connected'}</h2><p className="muted-copy">{health.ok ? 'Your local model endpoint is responding. Inference stays on this device.' : 'Start Ollama and the local J.A.R.V.I.S. bridge to connect.'}</p><button className="primary-button" onClick={onOpenChat}>Open Chat</button></div><div className="desk-card"><div className="card-heading">System Monitor</div><Meter label="CPU" value={system ? `${system.cpu}%` : '—'} percent={system?.cpu ?? 0} /><Meter label="GPU" value={system?.gpu ? `${system.gpu.utilization}%` : 'Unavailable'} percent={system?.gpu?.utilization ?? 0} /><Meter label="RAM" value={system ? `${formatBytes(system.ramUsed)} / ${formatBytes(system.ramTotal)}` : '—'} percent={system ? system.ramUsed / system.ramTotal * 100 : 0} /></div></div>
  if (section === 'Memory') return <div className="desk-card wide-card"><div className="card-heading">Local Conversations <span>{threads.length} saved</span></div>{threads.length ? threads.map((thread) => <div className="installed-model" key={thread.id}><span className="role-icon">▤</span><span><b>{thread.title}</b><small>{thread.messages.length} messages · {new Date(thread.updatedAt).toLocaleString()}</small></span></div>) : <p className="muted-copy">Conversations will be stored in this application’s local browser storage on this device.</p>}</div>
  if (section === 'System') return <div className="section-grid"><div className="desk-card wide-card"><div className="card-heading">System Monitor <button onClick={onRefresh}>Refresh</button></div><Meter label="CPU" value={system ? `${system.cpu}%` : '—'} percent={system?.cpu ?? 0} /><Meter label="GPU" value={system?.gpu ? `${system.gpu.utilization}%` : 'NVIDIA telemetry unavailable'} percent={system?.gpu?.utilization ?? 0} /><Meter label="RAM" value={system ? `${formatBytes(system.ramUsed)} / ${formatBytes(system.ramTotal)}` : '—'} percent={system ? system.ramUsed / system.ramTotal * 100 : 0} /><Meter label="VRAM" value={system?.gpu ? `${formatBytes(system.gpu.vramUsed * 1024 ** 2)} / ${formatBytes(system.gpu.vramTotal * 1024 ** 2)}` : 'NVIDIA driver unavailable'} percent={system?.gpu ? system.gpu.vramUsed / system.gpu.vramTotal * 100 : 0} /></div><div className="desk-card"><div className="card-heading">Services</div><p className="service-state"><i className={health.ok ? 'good' : ''} />Ollama <b>{health.ok ? 'Connected' : 'Offline'}</b></p><p className="service-state"><i />Whisper / Piper <b>Not configured</b></p><p className="muted-copy">The NVIDIA driver did not provide telemetry. Chat remains available on CPU when Ollama supports the model.</p></div></div>
  if (section === 'Agents') return <div className="desk-card wide-card"><div className="card-heading">Specialist Roles</div>{['General Assistant · active primary model', 'Coding Expert · routes to installed coder model', 'Deep Reasoning · uses installed reasoning model when present', 'Vision Expert · requires a vision-capable installed model', 'Research Expert · local document tools are not configured'].map((role) => <div className="installed-model" key={role}><span className="role-icon">⌘</span><span><b>{role.split(' · ')[0]}</b><small>{role.split(' · ')[1]}</small></span><em>{role.startsWith('General') ? 'Active' : 'Auto route'}</em></div>)}</div>
  if (section === 'Voice') return <div className="desk-card wide-card"><div className="card-heading">Local Voice</div><h2 className="section-hero">{voice.stt || voice.tts ? 'Local voice available' : 'Text chat is ready'}</h2><p className="muted-copy">Audio stays on this machine. Whisper and Piper availability is detected from installed command-line tools and configured model files.</p><div className="tag-chip">Whisper transcription · {voice.stt ? 'ready' : 'unavailable'}</div><div className="tag-chip">Piper speech · {voice.tts ? 'ready' : 'unavailable'}</div></div>
  if (section === 'Tools') return <div className="desk-card wide-card"><div className="card-heading">Local Tools</div><p className="muted-copy">Local actions are disabled until an explicit, auditable permission layer is in place. The assistant cannot run arbitrary shell commands.</p><div className="tag-chip">Default policy · read-only</div></div>
  if (section === 'Files') return <div className="desk-card wide-card"><div className="card-heading">Local Files</div><p className="muted-copy">File indexing is not configured. No folders are scanned or uploaded. A future file workflow should use explicit selection and per-folder permissions.</p></div>
  return <div className="desk-card wide-card"><div className="card-heading">Settings</div><p className="muted-copy">Ollama endpoint: 127.0.0.1:11434<br />Default model: {health.model ?? 'Auto-detect Qwen'}<br />Conversation storage: local device<br />Cloud AI provider: disabled in the local build</p></div>
}
