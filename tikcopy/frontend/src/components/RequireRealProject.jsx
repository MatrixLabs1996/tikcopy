import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Plus, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'

const DEFAULT_PROJECT_NAME = 'Geral'

const isGeral = (p) => p && (p.name || '').trim().toLowerCase() === DEFAULT_PROJECT_NAME.toLowerCase()

/**
 * Bloqueia a página se o projeto ativo for "Geral" (ou nenhum).
 * Mostra modal pra selecionar um projeto real ou criar novo.
 * Usado em: Escrever, Briefings, Pesquisas, Meus Anúncios, Inteligência.
 */
export default function RequireRealProject({ children, pageName = 'esta área' }) {
  const activeProject = useAppStore((s) => s.activeProject)
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const navigate = useNavigate()

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const blocked = !activeProject || isGeral(activeProject)

  useEffect(() => {
    if (!blocked) { setLoading(false); return }
    api.get('/projects')
      .then((res) => setProjects(res.data || []))
      .finally(() => setLoading(false))
  }, [blocked])

  if (!blocked) return children

  const realProjects = projects.filter((p) => !isGeral(p))

  const handleSelect = (p) => {
    setActiveProject(p)
    toast.success(`Projeto "${p.name}" ativo`)
  }

  return (
    <>
      {/* Children renderizados por baixo (apagados visualmente) */}
      <div style={{ opacity: 0.15, pointerEvents: 'none', filter: 'blur(2px)' }}>
        {children}
      </div>

      {/* Overlay bloqueante */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          width: '100%', maxWidth: '480px',
          padding: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <FolderOpen size={18} style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Escolha um projeto
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
            Pra usar {pageName}, você precisa estar dentro de um projeto específico (não vale o <strong>Geral</strong>).
            Selecione um existente ou crie um novo.
          </p>

          {loading && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
              Carregando…
            </div>
          )}

          {!loading && (
            <>
              {realProjects.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto', marginBottom: '14px' }}>
                  {realProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelect(p)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: '8px',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'var(--font)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        {p.nicho && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {p.nicho}
                          </div>
                        )}
                      </div>
                      <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0 20px', fontStyle: 'italic' }}>
                  Você ainda não tem nenhum projeto além do Geral.
                </div>
              )}

              <button
                onClick={() => navigate('/projects/new')}
                className="tc-btn-primary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Plus size={14} /> Criar novo projeto
              </button>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
                Você vai definir a identidade da oferta e subir a pesquisa pra a IA conhecer o produto.
              </p>
            </>
          )}

          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              ← Voltar
            </button>
            <button
              onClick={() => navigate('/projects')}
              style={{
                fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Ver todos os projetos
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export { isGeral, DEFAULT_PROJECT_NAME }
