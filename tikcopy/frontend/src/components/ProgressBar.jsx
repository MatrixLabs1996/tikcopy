import { useState, useEffect } from 'react'
import { Check, Clock } from 'lucide-react'
import { STATUS_LABELS } from '../hooks/useTranscriptionJob'

/**
 * Pipeline de progresso visual — mostra todos os passos, qual está rodando,
 * quais já foram concluídos, e o tempo decorrido.
 *
 * Props:
 *   currentStatus: string atual do job (ex: "transcribing", "analyzing", "done")
 *   steps: ['queued', 'transcribing', 'analyzing', 'saving', 'done'] (ordem dos passos)
 *   compact: boolean — versão compacta (1 linha) ou expandida
 */
export default function ProgressBar({ currentStatus, steps, compact = false }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (currentStatus === 'done' || currentStatus === 'error') return
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [currentStatus])

  if (!currentStatus) return null

  const currentIdx = steps.findIndex((s) => s === currentStatus)
  const isError = currentStatus === 'error'

  const fmt = (s) => {
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60), r = s % 60
    return `${m}m${r > 0 ? ` ${r}s` : ''}`
  }

  if (compact) {
    return (
      <div style={{
        marginTop: '14px', padding: '10px 14px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        borderRadius: '8px', fontSize: '13px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ width: '14px', height: '14px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
        <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
          {STATUS_LABELS[currentStatus] || currentStatus}
        </span>
        {elapsed > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Clock size={10} /> {fmt(elapsed)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      marginTop: '18px', padding: '16px 18px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: '10px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {isError ? 'Erro no processamento' : 'Processando'}
        </div>
        {elapsed > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} /> {fmt(elapsed)}
          </div>
        )}
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step, i) => {
          const isCurrent = step === currentStatus
          const isPast = i < currentIdx || currentStatus === 'done'
          const isFuture = i > currentIdx && !isPast
          const label = STATUS_LABELS[step] || step

          if (step === 'done') return null

          return (
            <div key={step} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              fontSize: '12px',
              opacity: isFuture ? 0.4 : 1,
              transition: 'opacity 0.3s',
            }}>
              {/* Bolinha de status */}
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isPast ? '#22c55e' : isCurrent ? 'transparent' : 'var(--bg-surface)',
                border: isCurrent ? '2px solid var(--accent)' : isPast ? 'none' : '1px solid var(--border-strong)',
                flexShrink: 0,
              }}>
                {isPast && <Check size={11} color="#fff" strokeWidth={3} />}
                {isCurrent && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                )}
              </div>

              {/* Label */}
              <span style={{
                color: isCurrent ? 'var(--text-primary)' : isPast ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontWeight: isCurrent ? 600 : 400,
                flex: 1,
              }}>
                {label}
              </span>

              {/* Spinner do atual */}
              {isCurrent && (
                <div style={{ width: '12px', height: '12px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              )}
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  )
}

// ─── Pipelines padrão por tipo de job ───────────────────────────

export const VSL_STEPS         = ['queued', 'transcribing', 'translating', 'analyzing', 'saving', 'done']
export const VSL_COMPARE_STEPS = ['queued', 'analyzing_vsl1', 'analyzing_vsl2', 'comparing', 'done']
export const AD_STEPS          = ['queued', 'analyzing', 'translating', 'reverse_engineering', 'seven_layers', 'saving', 'done']
export const ORGANIC_URL_STEPS = ['queued', 'downloading', 'transcribing', 'translating', 'formatting', 'saving', 'done']
export const ORGANIC_UPLOAD_STEPS = ['queued', 'transcribing', 'translating', 'formatting', 'saving', 'done']
export const LESSON_STEPS = ['queued', 'transcribing', 'translating', 'saving', 'done']
