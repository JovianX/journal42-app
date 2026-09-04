import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { JournalLockProvider } from './auth/JournalLockProvider.tsx'
import { captureAppInstallEvents } from './lib/useAppInstall.ts'
import './index.css'
import App from './App.tsx'

captureAppInstallEvents()

// Always refresh when a new SW is ready.
// Without this, some users can get a stale/broken JS bundle until they clear cache.
registerSW({
  immediate: true,
  onNeedRefresh: () => {
    window.location.reload()
  },
})

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
