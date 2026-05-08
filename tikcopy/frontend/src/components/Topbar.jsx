import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import useAppStore from '../stores/useAppStore'
import api from '../services/api'

export default function Topbar() {
  const { user, activeProject, setActiveProject } = useAppStore()
  const [projects, setProjects] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api.get('/projects').then((r) => setProjects(r.data)).catch(() => {})
  }, [])

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 'var(--sidebar-width)',
      right: 0,
      height: 'var(--topbar-height)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      zIndex: 10,
    }}>
      {/* Project selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: '6px', padding: '5px 10px 5px 11px',
            fontSize: '12px', color: 'var(--text-secondary)',
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          {activeProject ? activeProject.name : 'Selecionar projeto'}
          <ChevronDown size={12} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: '110%', left: 0, minWidth: '200px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: '8px', padding: '4px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}>
            <button
              onClick={() => { setActiveProject(null); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 10px', fontSize: '12px', color: 'var(--text-muted)',
                background: 'transparent', border: 'none', borderRadius: '5px',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Sem projeto
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setActiveProject(p); setOpen(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 10px', fontSize: '12px',
                  color: activeProject?.id === p.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: activeProject?.id === p.id ? 'var(--bg-active)' : 'transparent',
                  border: 'none', borderRadius: '5px',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {p.name}
                {p.niche && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>· {p.niche}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: user plan badge */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {user?.email}
      </div>
    </header>
  )
}
