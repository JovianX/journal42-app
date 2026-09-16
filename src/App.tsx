import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.tsx'
import RequireJournalUnlock from './auth/RequireJournalUnlock.tsx'
import RedirectIfSignedIn from './auth/RedirectIfSignedIn.tsx'
import AuthLoading from './auth/AuthLoading.tsx'
import PartnerAttribution from './components/PartnerAttribution.tsx'
import { useVisualViewport } from './lib/useVisualViewport.ts'
import JournalHome from './pages/JournalHome.tsx'
import Login from './pages/Login.tsx'
import Settings from './pages/Settings.tsx'
import './App.css'

const VoiceLab = lazy(() => import('./pages/VoiceLab.tsx'))
const Partner = lazy(() => import('./pages/Partner.tsx'))
const PartnerReview = lazy(() => import('./pages/PartnerReview.tsx'))

export default function App() {
  useVisualViewport()

  return (
    <>
      <PartnerAttribution />
      <Routes>
        <Route element={<RequireAuth />}>
          <Route
            path="/partner"
            element={
              <Suspense fallback={<AuthLoading />}>
                <Partner />
              </Suspense>
            }
          />
          <Route
            path="/partner/review"
            element={
              <Suspense fallback={<AuthLoading />}>
                <PartnerReview />
              </Suspense>
            }
          />
          <Route element={<RequireJournalUnlock />}>
            <Route path="/" element={<JournalHome />} />
            <Route path="/voice-lab" element={
              <Suspense fallback={<AuthLoading />}>
                <VoiceLab />
              </Suspense>
            } />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Navigate to="/settings" replace />} />
          </Route>
        </Route>
        <Route element={<RedirectIfSignedIn />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Login />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
