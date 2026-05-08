import { NavLink, useNavigate } from 'react-router-dom'
import {
  Video, GraduationCap, Megaphone, MessageSquare,
  LayoutTemplate, FileText, BookOpen, Search, Clock,
  Settings, LogOut, Sun, Moon, FolderOpen, ChevronRight,
} from 'lucide-react'
import useAppStore from '../stores/useAppStore'
import { supabase } from '../services/supabase'

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
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
      padding: '16px 12px',
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      overflowY: 'auto',
    }}>
      {/* Brand */}
      <NavLink to="/" style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '14px',
        }}>
          <div style={{
            width: '28px', height: '28px',
            background: '#fff',
            borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 800, color: 'var(--accent)',
            flexShrink: 0, letterSpacing: '-1px',
          }}>TC</div>
          <span style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
            Tik<span style={{ color: 'var(--accent)' }}>Copy</span>
          </span>
        </div>
      </NavLink>

      {/* Active project widget */}
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

      {/* Nav */}
      <SectionLabel label="Transcrever" />
      <NavItem to="/organic" icon={Video} label="Vídeos Orgânicos" />
      <NavItem to="/lessons" icon={GraduationCap} label="Podcasts & Aulas" />
      <NavItem to="/ads" icon={Megaphone} label="Anúncios" />

      <SectionLabel label="Copy" />
      <NavItem to="/copy-zone" icon={MessageSquare} label="Zona de Copy" />
      <NavItem to="/templates" icon={LayoutTemplate} label="Templates" />
      <NavItem to="/drafts" icon={FileText} label="Rascunhos" />

      <SectionLabel label="Pesquisa" />
      <NavItem to="/briefings" icon={BookOpen} label="Briefings" />
      <NavItem to="/researches" icon={Search} label="Pesquisas" />

      <SectionLabel label="Histórico" />
      <NavItem to="/history" icon={Clock} label="Recentes" />

      <SectionLabel label="Projetos" />
      <NavItem to="/projects" icon={FolderOpen} label="Meus Projetos" />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
        {/* User info */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user?.email}</div>
        </div>

        {/* Settings + Logout */}
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

        {/* Theme toggle */}
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
