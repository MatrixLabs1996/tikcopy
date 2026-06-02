import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './services/supabase'
import useAppStore from './stores/useAppStore'

import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import RequireRealProject from './components/RequireRealProject'

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
import ProjectCreatePage from './pages/ProjectCreatePage'
import CopyEditorPage from './pages/CopyEditorPage'
import SwipePage from './pages/SwipePage'
import VSLPage from './pages/VSLPage'
import ProfileAnalysisPage from './pages/ProfileAnalysisPage'
import BrainstormPage from './pages/BrainstormPage'
import AdminPage from './pages/AdminPage'
import BriefingViewerPage from './pages/BriefingViewerPage'

// Título da aba do navegador por rota → "Página | CopyX"
const PAGE_TITLES = {
  '/': 'Início',
  '/organic': 'Vídeos Orgânicos',
  '/lessons': 'Podcasts & Aulas',
  '/ads': 'Anúncios',
  '/vsl': 'VSL',
  '/copy-zone': 'Inteligência',
  '/criar-copy': 'Escrever',
  '/swipe': 'Swipe File',
  '/drafts': 'Minhas Copys',
  '/raio-x': 'Raio-X de Perfil',
  '/brainstorm': 'Brainstorm ADS',
  '/briefings': 'Projeto',
  '/researches': 'Pesquisas',
  '/history': 'Recentes',
  '/projects': 'Meus Projetos',
  '/projects/new': 'Novo Projeto',
  '/admin': 'Custo & Uso',
  '/settings': 'Configurações',
  '/templates': 'Templates',
  '/login': 'Entrar',
  '/register': 'Criar conta',
}

function TitleManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    let title = PAGE_TITLES[pathname]
    if (!title) {
      if (pathname.includes('/view')) title = 'Documento'
      else if (pathname.startsWith('/projects/')) title = 'Projeto'
    }
    document.title = title ? `${title} | CopyX` : 'CopyX'
  }, [pathname])
  return null
}

export default function App() {
  const { setUser, setSession, clearAuth, setAuthReady } = useAppStore()
  const navigate = useNavigate()

  useEffect(() => {
    // getSession() is the single source of truth for initial load.
    // It resolves only after Supabase has validated (or refreshed) the stored token,
    // so authReady is guaranteed to reflect the real auth state.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        setSession(session)
      }
      setAuthReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setUser(session.user)
        setSession(session)
      } else if (event === 'SIGNED_OUT') {
        clearAuth()
      }

      if (['SIGNED_IN', 'TOKEN_REFRESHED'].includes(event) &&
          (window.location.pathname === '/login' || window.location.pathname === '/register')) {
        navigate('/', { replace: true })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      <TitleManager />
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
          <Route path="/copy-zone" element={<RequireRealProject pageName="a Inteligência"><CopyZonePage /></RequireRealProject>} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/drafts" element={<RequireRealProject pageName="Minhas Copys"><DraftsPage /></RequireRealProject>} />
          <Route path="/briefings" element={<RequireRealProject pageName="Projeto"><BriefingsPage /></RequireRealProject>} />
          <Route path="/researches" element={<RequireRealProject pageName="Pesquisas"><ResearchesPage /></RequireRealProject>} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<ProjectCreatePage />} />
          <Route path="/criar-copy" element={<RequireRealProject pageName="Escrever"><CopyEditorPage /></RequireRealProject>} />
          <Route path="/swipe" element={<SwipePage />} />
          <Route path="/raio-x" element={<ProfileAnalysisPage />} />
          <Route path="/brainstorm" element={<BrainstormPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/vsl" element={<VSLPage />} />
        </Route>

        {/* Viewer standalone (sem sidebar) pra abrir docs em aba dedicada */}
        <Route path="/briefings/:id/view" element={<ProtectedRoute><BriefingViewerPage /></ProtectedRoute>} />
        <Route path="/research-docs/:id/view" element={<ProtectedRoute><BriefingViewerPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
