import { NavLink, useNavigate } from 'react-router-dom'
import {
  Video, GraduationCap, Megaphone, MessageSquare,
  PenLine, FileText, BookOpen, Search, Clock,
  Settings, LogOut, Sun, Moon, FolderOpen, ChevronRight, Layers, TvMinimalPlay, Radar, Sparkles,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import useAppStore from '../stores/useAppStore'
import { supabase } from '../services/supabase'
import { guardedNavigate } from '../stores/editorNavGuard'
import api from '../services/api'

function NavItem({ to, icon: Icon, label }) {
  const navigate = useNavigate()
  return (
    <NavLink
      to={to}
      onClick={(e) => {
        e.preventDefault()
        guardedNavigate(navigate, to)
      }}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 8px',
        borderRadius: '6px',
        fontSize: '13px',
        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        fontWeight: isActive ? 500 : 400,
        textDecoration: 'none',
        marginBottom: '1px',
        transition: 'background 0.12s, color 0.12s',
      })}
    >
      <Icon size={14} />
      {label}
    </NavLink>
  )
}

function SectionLabel({ label }) {
  return (
    <div style={{
      fontSize: '10px',
      fontWeight: 500,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      padding: '4px 0 6px',
      marginTop: '8px',
    }}>
      {label}
    </div>
  )
}

export default function Sidebar() {
  const { user, theme, toggleTheme, clearAuth, activeProject } = useAppStore()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    api.get('/admin/me').then(r => setIsAdmin(!!r.data.is_admin)).catch(() => setIsAdmin(false))
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    clearAuth()
    navigate('/login')
  }

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
    }}>
      {/* ── Topo fixo: brand + projeto ── */}
      <div style={{ flexShrink: 0, padding: '14px 12px 0' }}>
        <NavLink to="/" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: '10px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '12px',
          }}>
            <img
              src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'}
              alt="CopyX"
              style={{ width: '50%', height: 'auto', display: 'block', maxHeight: '40px', objectFit: 'contain' }}
            />
          </div>
        </NavLink>

        <NavLink to="/projects" style={{ textDecoration: 'none', marginBottom: '10px', display: 'block' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', borderRadius: '7px',
            background: activeProject ? 'rgba(255,62,94,0.06)' : 'var(--bg-elevated)',
            border: `1px solid ${activeProject ? 'rgba(255,62,94,0.2)' : 'var(--border-default)'}`,
            cursor: 'pointer', transition: 'all 0.12s',
          }}>
            <FolderOpen size={13} color={activeProject ? 'var(--accent)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '1px' }}>Projeto ativo</div>
              <div style={{
                fontSize: '12px', fontWeight: 500,
                color: activeProject ? 'var(--text-primary)' : 'var(--text-muted)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {activeProject ? activeProject.name : 'Nenhum selecionado'}
              </div>
            </div>
            <ChevronRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          </div>
        </NavLink>
      </div>

      {/* ── Meio scrollável: nav ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        <SectionLabel label="Transcrever" />
        <NavItem to="/organic" icon={Video} label="Vídeos Orgânicos" />
        <NavItem to="/lessons" icon={GraduationCap} label="Podcasts & Aulas" />
        <NavItem to="/ads" icon={Megaphone} label="Anúncios" />
        <NavItem to="/vsl" icon={TvMinimalPlay} label="VSL" />

        <SectionLabel label="Copy" />
        <NavItem to="/copy-zone" icon={MessageSquare} label="Inteligência" />
        <NavItem to="/criar-copy" icon={PenLine} label="Escrever" />
        <NavItem to="/swipe" icon={Layers} label="Swipe File" />
        <NavItem to="/drafts" icon={FileText} label="Minhas Copys" />

        <SectionLabel label="Análise" />
        <NavItem to="/raio-x" icon={Radar} label="Raio-X de Perfil" />
        <NavItem to="/brainstorm" icon={Sparkles} label="Brainstorm ADS" />

        <SectionLabel label="Pesquisa" />
        <NavItem to="/briefings" icon={BookOpen} label="Projeto" />
        <NavItem to="/researches" icon={Search} label="Pesquisas" />

        <SectionLabel label="Histórico" />
        <NavItem to="/history" icon={Clock} label="Recentes" />

        <SectionLabel label="Projetos" />
        <NavItem to="/projects" icon={FolderOpen} label="Meus Projetos" />
      </div>

      {/* ── Rodapé fixo: user + logout + tema ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-subtle)', padding: '12px 12px 16px' }}>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user?.email}</div>
        </div>

        {isAdmin && <NavItem to="/admin" icon={BarChart3} label="Custo & Uso (admin)" />}
        <NavItem to="/settings" icon={Settings} label="Configurações" />
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          width: '100%', padding: '7px 8px', borderRadius: '6px',
          fontSize: '13px', color: 'var(--text-muted)', background: 'transparent',
          border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
          transition: 'color 0.12s',
        }}>
          <LogOut size={14} /> Sair
        </button>

        <button onClick={toggleTheme} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          width: '100%', padding: '7px 8px', borderRadius: '6px',
          fontSize: '12px', color: 'var(--text-muted)', background: 'transparent',
          border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
          marginTop: '2px',
        }}>
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </button>
      </div>
    </aside>
  )
}
