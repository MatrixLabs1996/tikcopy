import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import useConfirmStore from '../stores/useConfirmStore'

/**
 * Modal de confirmação global — padrão do site. Montado uma vez no AppLayout.
 * Disparado via confirmAction({ title, message, confirmLabel, cancelLabel, danger }).
 */
export default function ConfirmDialog() {
  const { isOpen, opts, close } = useConfirmStore()

  const choices = opts._choices && opts._choices.length ? opts._choices : null

  // Enter confirma, Esc cancela. No modo múltipla escolha, Enter não confirma nada
  // (evita escolher destrutivo por engano); Esc/cancelar resolve com null.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Enter' && !choices) { e.preventDefault(); close(true) }
      if (e.key === 'Escape') { e.preventDefault(); close(choices ? null : false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close, choices])

  if (!isOpen) return null

  const {
    title = 'Tem certeza?',
    message = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = true,
  } = opts

  const accent = danger ? 'var(--accent)' : '#8b5cf6'

  return (
    <div
      onClick={() => close(choices ? null : false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '14px', padding: '22px 24px', width: '100%', maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)', fontFamily: 'var(--font)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: message ? '8px' : '18px' }}>
          <div style={{
            flexShrink: 0, width: '34px', height: '34px', borderRadius: '9px',
            background: `${accent}15`, color: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={17} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', paddingTop: '6px' }}>
            {title}
          </div>
        </div>

        {message && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 20px', paddingLeft: '46px' }}>
            {message}
          </p>
        )}

        {choices ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => close(null)}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {cancelLabel}
            </button>
            {choices.map((c) => {
              const c1 = c.danger ? 'var(--accent)' : (c.primary ? '#8b5cf6' : null)
              return (
                <button
                  key={c.value}
                  onClick={() => close(c.value)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    background: c1 || 'transparent',
                    border: c1 ? 'none' : '1px solid var(--border-default)',
                    color: c1 ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => close(false)}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {cancelLabel}
            </button>
            <button
              autoFocus
              onClick={() => close(true)}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                background: accent, border: 'none', color: '#fff',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
