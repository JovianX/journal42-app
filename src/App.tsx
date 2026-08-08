import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.tsx'
import RedirectIfSignedIn from './auth/RedirectIfSignedIn.tsx'
import JournalHome from './pages/JournalHome.tsx'
import Login from './pages/Login.tsx'
import Settings from './pages/Settings.tsx'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<JournalHome />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Navigate to="/settings" replace />} />
      </Route>
      <Route element={<RedirectIfSignedIn />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
