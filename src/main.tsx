import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { JournalLockProvider } from './auth/JournalLockProvider.tsx'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <JournalLockProvider>
          <App />
        </JournalLockProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
