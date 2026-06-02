import { NavLink, useNavigate } from 'react-router-dom'
import {
  Video, GraduationCap, Megaphone, MessageSquare,
  PenLine, FileText, BookOpen, Search, Clock,
  Settings, LogOut, FolderOpen, ChevronRight, Layers, TvMinimalPlay, Radar, Sparkles,
  PanelLeftClose, PanelLeft,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import useAppStore from '../stores/useAppStore'
import { supabase } from '../services/supabase'
import { guardedNavigate } from '../stores/editorNavGuard'
import api from '../services/api'

function NavItem({ to, icon: Icon, label, collapsed }) {
  const navigate = useNavigate()
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      onClick={(e) => { e.preventDefault(); guardedNavigate(navigate, to) }}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '8px',
        padding: collapsed ? '9px 0' : '7px 8px',
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
      <Icon size={collapsed ? 17 : 14} style={{ flexShrink: 0 }} />
      {!collapsed && label}
    </NavLink>
  )
}

// Item desativado ("em breve") — não navega, fica cinza com selo.
function SoonItem({ icon: Icon, label, collapsed }) {
  return (
    <div
      title={collapsed ? `${label} (em breve)` : undefined}
      style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '8px',
        padding: collapsed ? '9px 0' : '7px 8px',
        borderRadius: '6px', fontSize: '13px',
        color: 'var(--text-muted)', opacity: 0.45,
        cursor: 'not-allowed', marginBottom: '1px', userSelect: 'none',
      }}
    >
      <Icon size={collapsed ? 17 : 14} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <>
          <span>{label}</span>
          <span style={{
            marginLeft: 'auto', fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
            border: '1px solid var(--border-default)', borderRadius: '4px', padding: '1px 5px',
          }}>
            em breve
          </span>
        </>
      )}
    </div>
  )
}

function SectionLabel({ label, collapsed }) {
  if (collapsed) return <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '10px 8px' }} />
  return (
    <div style={{
      fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      padding: '4px 0 6px', marginTop: '8px',
    }}>
      {label}
    </div>
  )
}

export default function Sidebar({ collapsed = false, onToggle }) {
  const { user, theme, clearAuth, activeProject } = useAppStore()
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
      transition: 'width 0.15s ease',
    }}>
      {/* ── Topo: brand + toggle + projeto ── */}
      <div style={{ flexShrink: 0, padding: collapsed ? '12px 8px 0' : '14px 12px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '12px',
        }}>
          {!collapsed && (
            <NavLink to="/" style={{ textDecoration: 'none', display: 'flex', flex: 1, justifyContent: 'center' }}>
              <img
                src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'}
                alt="CopyX"
                style={{ width: '50%', height: 'auto', maxHeight: '40px', objectFit: 'contain' }}
              />
            </NavLink>
          )}
          <button
            onClick={onToggle}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center', flexShrink: 0,
            }}
          >
            {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {collapsed ? (
          <NavLink to="/projects" title={activeProject ? activeProject.name : 'Projetos'} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '38px', height: '38px', borderRadius: '8px',
              background: activeProject ? 'rgba(255,62,94,0.06)' : 'var(--bg-elevated)',
              border: `1px solid ${activeProject ? 'rgba(255,62,94,0.2)' : 'var(--border-default)'}`,
            }}>
              <FolderOpen size={15} color={activeProject ? 'var(--accent)' : 'var(--text-muted)'} />
            </div>
          </NavLink>
        ) : (
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
                <div style={{ fontSize: '12px', fontWeight: 500, color: activeProject ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeProject ? activeProject.name : 'Nenhum selecionado'}
                </div>
              </div>
              <ChevronRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            </div>
          </NavLink>
        )}
      </div>

      {/* ── Meio scrollável: nav ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '0 8px' : '0 12px' }}>
        <SectionLabel label="Transcrever" collapsed={collapsed} />
        <NavItem to="/organic" icon={Video} label="Vídeos Orgânicos" collapsed={collapsed} />
        <NavItem to="/lessons" icon={GraduationCap} label="Podcasts & Aulas" collapsed={collapsed} />
        <NavItem to="/ads" icon={Megaphone} label="Anúncios" collapsed={collapsed} />
        <NavItem to="/vsl" icon={TvMinimalPlay} label="VSL" collapsed={collapsed} />

        <SectionLabel label="Copy" collapsed={collapsed} />
        <NavItem to="/copy-zone" icon={MessageSquare} label="Inteligência" collapsed={collapsed} />
        <NavItem to="/criar-copy" icon={PenLine} label="Escrever" collapsed={collapsed} />
        <NavItem to="/swipe" icon={Layers} label="Swipe File" collapsed={collapsed} />
        <NavItem to="/drafts" icon={FileText} label="Minhas Copys" collapsed={collapsed} />

        <SectionLabel label="Análise" collapsed={collapsed} />
        <SoonItem icon={Radar} label="Raio-X de Perfil" collapsed={collapsed} />
        <SoonItem icon={Sparkles} label="Brainstorm ADS" collapsed={collapsed} />

        <SectionLabel label="Pesquisa" collapsed={collapsed} />
        <NavItem to="/briefings" icon={BookOpen} label="Projeto" collapsed={collapsed} />
        <NavItem to="/researches" icon={Search} label="Pesquisas" collapsed={collapsed} />

        <SectionLabel label="Histórico" collapsed={collapsed} />
        <NavItem to="/history" icon={Clock} label="Recentes" collapsed={collapsed} />

        <SectionLabel label="Projetos" collapsed={collapsed} />
        <NavItem to="/projects" icon={FolderOpen} label="Meus Projetos" collapsed={collapsed} />
      </div>

      {/* ── Rodapé: user + admin + settings + logout ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-subtle)', padding: collapsed ? '10px 8px 14px' : '12px 12px 16px' }}>
        {!collapsed && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
              {user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
        )}

        {isAdmin && <NavItem to="/admin" icon={BarChart3} label="Custo & Uso (admin)" collapsed={collapsed} />}
        <NavItem to="/settings" icon={Settings} label="Configurações" collapsed={collapsed} />
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sair' : undefined}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : '8px', width: '100%', padding: collapsed ? '9px 0' : '7px 8px',
            borderRadius: '6px', fontSize: '13px', color: 'var(--text-muted)', background: 'transparent',
            border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'color 0.12s',
          }}
        >
          <LogOut size={collapsed ? 17 : 14} style={{ flexShrink: 0 }} /> {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  )
}
