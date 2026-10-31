import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Desktop from './Desktop.tsx'

// Deliberately no StrictMode: its double-invoked effects would open the
// microphone and arm the wake-word engine twice, and the second subscription
// steals the audio stream from the first.
const Root = import.meta.env.VITE_DESKTOP_SHELL === 'false' ? App : Desktop
createRoot(document.getElementById('root')!).render(<Root />)
