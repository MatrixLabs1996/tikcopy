import { useState } from 'react'
import { Sparkles, Loader2, Check, X, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

/**
 * Botão "Sugerir" do modo Híbrido.
 * Abre um modal com uma CAIXA DE TEXTO: o copy escreve o que quer e pede pra IA gerar.
 * Vale pra qualquer campo (hook, body, etc.) — sem menu de estratégias.
 *
 * Props:
 *  - field, currentValue, buildContext, onApply, label, n, compact
 */
export default function SuggestionButton({ field, currentValue, buildContext, onApply, label = 'Sugerir', n = 3, compact = false }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [instruction, setInstruction] = useState('')

  const handleOpen = () => {
    setOpen(true)
    setSuggestions([])
    setInstruction('')
  }

  const generate = async () => {
    setLoading(true)
    try {
      const ctx = buildContext() || {}
      const res = await api.post('/ai/suggest-field', {
        field,
        current_value: currentValue || '',
        instruction: instruction || null,
        n,
        ...ctx,
      })
      setSuggestions(res.data.suggestions || [])
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao gerar sugestões')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Sugerir com IA"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: compact ? '3px 7px' : '4px 9px',
          borderRadius: '6px', fontSize: compact ? '10px' : '11px',
          background: 'transparent', border: '1px solid var(--accent)',
          color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
        }}
      >
        <Sparkles size={compact ? 10 : 11} />
        {!compact && label}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
              borderRadius: '12px', width: '100%', maxWidth: '640px', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
            }}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                  Gerar <span style={{ color: 'var(--accent)' }}>{field}</span> com a IA
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Caixa de mensagem + gerar */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea
                className="tc-input tc-textarea"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder='Escreva o que você quer. Ex: "um gancho de conspiração com a frequência proibida", "mantenha a 1ª frase", "mais agressivo, sem emoji"…'
                rows={3}
                style={{ fontSize: '13px', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
              />
              <button
                onClick={generate}
                disabled={loading}
                className="tc-btn-primary"
                style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
              >
                {loading
                  ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</>
                  : <><RefreshCw size={12} /> {suggestions.length ? 'Gerar de novo' : 'Gerar'}</>}
              </button>
            </div>

            {/* Resultados */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {loading && suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 10px', color: 'var(--accent)' }} />
                  Gerando…
                </div>
              ) : suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                  <Sparkles size={20} style={{ display: 'block', margin: '0 auto 10px', color: 'var(--accent)', opacity: 0.7 }} />
                  Escreva acima o que você quer e clique em <strong>Gerar</strong>.<br />
                  A IA usa a oferta, o briefing e a referência ativa como base.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {suggestions.map((s, i) => (
                    <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{s}</div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { onApply(s); setOpen(false) }}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500 }}
                        >
                          <Check size={11} /> Usar esta
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
