import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import TranscriptionDock from './TranscriptionDock'
import ConfirmDialog from './ConfirmDialog'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import useTaxonomyStore from '../stores/useTaxonomyStore'
import { isGeral, DEFAULT_PROJECT_NAME } from './RequireRealProject'

// Páginas que usam layout largo (precisam de mais espaço horizontal)
const WIDE_ROUTES = ['/criar-copy', '/swipe', '/drafts', '/researches', '/briefings']

export default function AppLayout() {
  const location = useLocation()
  const isWide = WIDE_ROUTES.some((p) => location.pathname.startsWith(p))

  const activeProject = useAppStore((s) => s.activeProject)
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const user = useAppStore((s) => s.user)
  const loadTaxonomy = useTaxonomyStore((s) => s.load)

  // Carrega nichos/formatos custom já usados (pra dropdowns mostrarem tudo)
  useEffect(() => { if (user) loadTaxonomy() }, [user?.id]) // eslint-disable-line

  // Garante que o usuário sempre tem o projeto "Geral" carregado e setado por padrão.
  useEffect(() => {
    if (!user) return
    api.get('/projects')
      .then((res) => {
        const projects = res.data || []
        // Se não tem nenhum ativo, seta o "Geral"
        if (!activeProject) {
          const def = projects.find((p) => (p.name || '').trim().toLowerCase() === DEFAULT_PROJECT_NAME.toLowerCase())
          if (def) setActiveProject(def)
          return
        }
        // Se o ativo foi deletado fora do app, volta pro Geral
        const stillExists = projects.find((p) => p.id === activeProject.id)
        if (!stillExists) {
          const def = projects.find((p) => isGeral(p))
          if (def) setActiveProject(def)
        }
      })
      .catch(() => {})
  }, [user?.id]) // eslint-disable-line

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Topbar />
      <div style={{
        marginLeft: 'var(--sidebar-width)',
        marginTop: 'var(--topbar-height)',
        flex: 1,
        overflowY: 'auto',
        padding: '28px 32px',
        maxWidth: isWide ? 'none' : '900px',
      }}>
        <Outlet />
      </div>
      {/* Barra global de transcrições em background — sobrevive à troca de página */}
      <TranscriptionDock />
      {/* Modal de confirmação global (padrão do site) */}
      <ConfirmDialog />
    </div>
  )
}
