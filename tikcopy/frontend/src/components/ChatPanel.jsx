import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, Trash2 } from 'lucide-react'
import api from '../services/api'
import Markdown from './Markdown'
import { confirmAction } from '../stores/useConfirmStore'

/**
 * Painel lateral de chat com a IA (modo Híbrido).
 *
 * Props:
 *  - buildContext: () => object  retorna { project_id, briefing, meta, current_hooks, current_body }
 *  - chatKey: string             chave única pra persistir histórico (ex: 'copyEditor:new:chat')
 */
export default function ChatPanel({ buildContext, chatKey }) {
  const persistKey = `${chatKey || 'copyEditor:chat'}:history`
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(persistKey) || '[]') }
    catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(persistKey, JSON.stringify(messages)) } catch {}
    // Scroll automático pro final
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, persistKey])

  const sendMessage = async (overrideText) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return
    setInput('')
    const newHistory = [...messages, { role: 'user', content: text }]
    setMessages(newHistory)
    setLoading(true)
    try {
      const ctx = buildContext() || {}
      const res = await api.post('/ai/chat', {
        message: text,
        history: messages,  // histórico ANTES desta mensagem
        ...ctx,
      })
      setMessages([...newHistory, { role: 'assistant', content: res.data.reply || '(sem resposta)' }])
    } catch (err) {
      setMessages([...newHistory, {
        role: 'assistant',
        content: `❌ Erro: ${err.response?.data?.detail || err.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  const clearHistory = async () => {
    if (messages.length > 0 && !(await confirmAction({ title: 'Apagar o histórico do chat?', confirmLabel: 'Apagar' }))) return
    setMessages([])
    try { localStorage.removeItem(persistKey) } catch {}
  }

  const QUICK_PROMPTS = [
    { label: 'Sugere 3 hooks novos baseados no briefing', prompt: 'Me dá 3 hooks novos pra esse anúncio, baseado no briefing e nas referências. Cada hook em uma linha.' },
    { label: 'Diagnostica o body atual', prompt: 'Analisa o body atual e me diz: gancho tá amarrado com a aterrissagem? Tem spike de dopamina? CTA tá forte? Aponte os pontos de melhoria.' },
    { label: 'Reescreve o body em tom mais agressivo', prompt: 'Reescreve o body atual num tom mais agressivo e direto, mantendo a estrutura.' },
    { label: 'Quais bullets faltam?', prompt: 'Olhando o briefing e o body, quais bullets/argumentos faltam pra deixar o anúncio mais forte?' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={13} style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Chat CopyX
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            title="Limpar conversa"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px',
              display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px',
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Histórico */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '10px', marginBottom: '20px', lineHeight: 1.6 }}>
              Pergunte qualquer coisa<br />ou use uma ação rápida:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q.prompt)}
                  style={{
                    textAlign: 'left', padding: '8px 11px', borderRadius: '7px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px',
                    fontFamily: 'var(--font)', lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
              color: m.role === 'user' ? 'var(--accent)' : 'var(--accent)',
              marginBottom: '4px', textTransform: 'uppercase',
            }}>
              {m.role === 'user' ? 'Você' : 'CopyX'}
            </div>
            <div style={{
              fontSize: '12px', lineHeight: 1.6, color: 'var(--text-primary)',
              background: m.role === 'user' ? 'transparent' : 'var(--bg-elevated)',
              padding: m.role === 'assistant' ? '10px 12px' : '0',
              borderRadius: m.role === 'assistant' ? '8px' : '0',
              border: m.role === 'assistant' ? '1px solid var(--border-subtle)' : 'none',
            }}>
              {m.role === 'assistant'
                ? <Markdown>{m.content}</Markdown>
                : <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              }
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '12px', padding: '8px 0' }}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            Pensando…
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Pergunte algo… (Enter pra enviar)"
            rows={2}
            disabled={loading}
            style={{
              flex: 1, resize: 'none',
              background: 'var(--bg-base)', border: '1px solid var(--border-default)',
              borderRadius: '7px', padding: '8px 10px', fontSize: '12px',
              color: 'var(--text-primary)', fontFamily: 'var(--font)', lineHeight: 1.5,
              outline: 'none',
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              padding: '8px 12px', borderRadius: '7px', flexShrink: 0,
              background: input.trim() && !loading ? 'var(--accent)' : 'transparent',
              border: `1px solid ${input.trim() && !loading ? 'var(--accent)' : 'var(--border-default)'}`,
              color: input.trim() && !loading ? '#fff' : 'var(--text-muted)',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
