import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, X, ChevronDown, ChevronUp, Activity } from 'lucide-react'
import useJobsStore, { isActive, pollActiveJobs } from '../stores/useJobsStore'
import { STATUS_LABELS } from '../hooks/useTranscriptionJob'

/**
 * Barra flutuante (canto inferior direito) que mostra TODAS as transcrições
 * em andamento — independente da página. Roda o poller global enquanto
 * houver jobs ativos. Sobrevive à troca de aba.
 */
export default function TranscriptionDock() {
  const jobs = useJobsStore((s) => s.jobs)
  const removeJob = useJobsStore((s) => s.removeJob)
  const clearDone = useJobsStore((s) => s.clearDone)
  const [collapsed, setCollapsed] = useState(false)
  const intervalRef = useRef(null)

  const active = jobs.filter(isActive)
  const done = jobs.filter((j) => j.status === 'done')
  const errored = jobs.filter((j) => j.status === 'error')

  // Poller global: roda enquanto houver job ativo
  useEffect(() => {
    if (active.length === 0) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    if (!intervalRef.current) {
      pollActiveJobs()  // chamada imediata
      intervalRef.current = setInterval(pollActiveJobs, 3000)
    }
    return () => {
      if (intervalRef.current && active.length === 0) {
        clearInterval(intervalRef.current); intervalRef.current = null
      }
    }
  }, [active.length])

  // Nada pra mostrar
  if (jobs.length === 0) return null

  const kindLabel = { organic: 'Orgânico', ad: 'Anúncio', vsl: 'VSL', lesson: 'Podcast/Aula', profile: 'Raio-X' }

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 900,
      width: collapsed ? 'auto' : '320px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
      fontFamily: 'var(--font)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', cursor: 'pointer',
          background: active.length ? 'rgba(255,62,94,0.06)' : 'var(--bg-elevated)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {active.length > 0
            ? <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 0.9s linear infinite' }} />
            : <Activity size={14} style={{ color: 'var(--text-muted)' }} />
          }
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {active.length > 0
              ? `Transcrevendo ${active.length} ${active.length === 1 ? 'vídeo' : 'vídeos'}…`
              : `${done.length} concluído${done.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!collapsed && (done.length > 0 || errored.length > 0) && (
            <button
              onClick={(e) => { e.stopPropagation(); clearDone() }}
              title="Limpar concluídos"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px', padding: '2px 6px' }}
            >
              limpar
            </button>
          )}
          {collapsed ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {/* Lista de jobs */}
      {!collapsed && (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {jobs.map((j) => (
            <div key={j.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ flexShrink: 0 }}>
                {j.status === 'done' && <CheckCircle2 size={14} style={{ color: '#22c55e' }} />}
                {j.status === 'error' && <AlertCircle size={14} style={{ color: 'var(--accent)' }} />}
                {isActive(j) && <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 0.9s linear infinite' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {j.label || 'Sem título'}
                </div>
                <div style={{ fontSize: '10px', color: j.status === 'error' ? 'var(--accent)' : 'var(--text-muted)', marginTop: '1px' }}>
                  <span style={{ opacity: 0.7 }}>{kindLabel[j.kind] || j.kind}</span>
                  {' · '}
                  {j.status === 'error'
                    ? (j.error || 'Erro')
                    : (STATUS_LABELS[j.status] || j.status)}
                </div>
              </div>
              {(j.status === 'done' || j.status === 'error') && (
                <button
                  onClick={() => removeJob(j.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, padding: '2px' }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
