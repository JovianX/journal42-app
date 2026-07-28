import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.tsx'
import RedirectIfSignedIn from './auth/RedirectIfSignedIn.tsx'
import JournalHome from './pages/JournalHome.tsx'
import Login from './pages/Login.tsx'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<JournalHome />} />
      </Route>
      <Route element={<RedirectIfSignedIn />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
