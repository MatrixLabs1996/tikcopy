import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './services/supabase'
import useAppStore from './stores/useAppStore'

import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'

import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import OrganicPage from './pages/OrganicPage'
import LessonsPage from './pages/LessonsPage'
import AdsPage from './pages/AdsPage'
import CopyZonePage from './pages/CopyZonePage'
import TemplatesPage from './pages/TemplatesPage'
import DraftsPage from './pages/DraftsPage'
import BriefingsPage from './pages/BriefingsPage'
import ResearchesPage from './pages/ResearchesPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import ProjectsPage from './pages/ProjectsPage'

export default function App() {
  const { setUser, setSession, clearAuth } = useAppStore()

  useEffect(() => {
    // Restore session on load
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user)
        setSession(data.session)
      }
    })

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user)
        setSession(session)
      } else {
        clearAuth()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            fontSize: '13px',
            fontFamily: 'var(--font)',
          },
        }}
      />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/organic" element={<OrganicPage />} />
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/ads" element={<AdsPage />} />
          <Route path="/copy-zone" element={<CopyZonePage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/briefings" element={<BriefingsPage />} />
          <Route path="/researches" element={<ResearchesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
