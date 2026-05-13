import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <PWAUpdatePrompt />
    </ErrorBoundary>
  </StrictMode>,
)
