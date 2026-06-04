import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Check, Trash2, FolderOpen, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { confirmAction } from '../stores/useConfirmStore'
import { isGeral } from '../components/RequireRealProject'

const isDemo = (user) => user?.id === 'demo'

export default function HomePage() {
  const navigate = useNavigate()
  const { user, activeProject, setActiveProject } = useAppStore()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const name = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Copywriter'
  const demo = isDemo(user)

  const fetchProjects = () => {
    if (demo) { setLoading(false); return }
    api.get('/projects')
      .then((res) => setProjects(res.data || []))
      .catch(() => toast.error('Erro ao carregar seus projetos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchProjects() }, [])

  const goNew = () => navigate('/projects/new')

  const handleSelect = (project) => {
    setActiveProject(project)
    toast.success(`Projeto "${project.name}" ativado`)
    navigate('/briefings')
  }

  const handleDelete = async (e, project) => {
    e.stopPropagation()
    const ok = await confirmAction({
      title: `Excluir "${project.name}"?`,
      message: 'O projeto, o dossiê e as pesquisas associadas serão removidos. Não dá pra desfazer.',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    try {
      await api.delete(`/projects/${project.id}`)
      setProjects((prev) => prev.filter((p) => p.id !== project.id))
      if (activeProject?.id === project.id) {
        const fallback = projects.find((p) => isGeral(p)) || null
        setActiveProject(fallback)
      }
      toast.success('Projeto excluído')
    } catch {
      toast.error('Erro ao excluir o projeto')
    }
  }

  // "Geral" é o projeto padrão/fallback — fica no topo e não pode ser excluído.
  const sorted = [...projects].sort((a, b) => {
    if (isGeral(a)) return -1
    if (isGeral(b)) return 1
    return 0
  })

  return (
    <div>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', paddingBottom: '24px' }}>
        <div>
          <div className="tc-badge" style={{ marginBottom: '16px' }}>
            <div className="tc-badge-dot" />
            CopyX
          </div>
          <h1 style={{
            fontSize: '32px', fontWeight: 700, letterSpacing: '-0.8px',
            color: 'var(--text-primary)', lineHeight: 1.15, marginBottom: '10px',
          }}>
            Olá, {name} 
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '520px' }}>
            Selecione um projeto pra continuar de onde parou, ou crie um novo pra a IA conhecer o produto.
          </p>
        </div>
        <button
          onClick={goNew}
          className="tc-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          <Plus size={14} /> Nova oferta
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando...</div>
      ) : sorted.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          border: '1px dashed var(--border-default)', borderRadius: '12px',
          color: 'var(--text-muted)',
        }}>
          <FolderOpen size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Nenhuma oferta ainda</div>
          <div style={{ fontSize: '12px', marginBottom: '16px' }}>Crie a primeira pra a IA conhecer o produto.</div>
          <button onClick={goNew} className="tc-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Nova oferta
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sorted.map((project) => {
            const active = activeProject?.id === project.id
            const geral = isGeral(project)
            return (
              <div
                key={project.id}
                onClick={() => handleSelect(project)}
                role="button"
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
                  borderRadius: '10px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'var(--border-default)' }}
              >
                {/* Nome + nicho + descrição */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {project.name}
                    </span>
                    {geral && (
                      <span style={{
                        background: 'var(--bg-active)', borderRadius: '999px',
                        padding: '2px 8px', fontSize: '10px', fontWeight: 600,
                        color: 'var(--text-secondary)', letterSpacing: '0.04em',
                        border: '1px solid var(--border-default)',
                      }}>
                        PADRÃO
                      </span>
                    )}
                    {project.nicho && (
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px',
                        background: 'rgba(255,62,94,0.08)', border: '1px solid rgba(255,62,94,0.2)',
                        fontSize: '11px', color: 'var(--accent)',
                      }}>
                        {project.nicho}
                      </span>
                    )}
                    {active && (
                      <span style={{
                        background: 'var(--accent)', borderRadius: '999px',
                        padding: '2px 8px', fontSize: '10px', fontWeight: 600,
                        color: '#fff', letterSpacing: '0.04em',
                      }}>
                        ATIVO
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.description}
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '12px', fontWeight: 500,
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                    {active ? <><Check size={13} /> Ativa</> : <>Abrir <ArrowRight size={13} /></>}
                  </span>
                  {!geral && (
                    <button
                      onClick={(e) => handleDelete(e, project)}
                      title="Excluir oferta"
                      style={{
                        padding: '6px', borderRadius: '6px',
                        background: 'transparent', border: '1px solid var(--border-default)',
                        color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
