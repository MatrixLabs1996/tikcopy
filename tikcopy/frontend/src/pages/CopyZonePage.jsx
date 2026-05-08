import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'

export default function CopyZonePage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    if (!activeProject) {
      toast.error('Selecione um projeto no topbar primeiro.')
      return
    }

    const userMsg = { role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await api.post(`/copy-zone/${activeProject.id}/chat`, {
        message: userMsg.content,
        active_context: { project: activeProject },
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.response }])
    } catch (err) {
      toast.error('Falha ao obter resposta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-height) - 56px)' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Zona de <span style={{ color: 'var(--accent)' }}>Copy</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {activeProject
            ? `Assistente com memória do projeto "${activeProject.name}"`
            : 'Selecione um projeto no topbar para ativar a memória do projeto.'}
        </p>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: '12px', paddingBottom: '16px',
      }}>
        {messages.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
            Faça uma pergunta sobre copy, peça para gerar um hook, avaliar um texto...
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
          }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
              border: m.role === 'assistant' ? '1px solid var(--border-default)' : 'none',
              fontSize: '13px',
              color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '10px 14px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: '12px 12px 12px 2px', fontSize: '13px', color: 'var(--text-muted)',
          }}>
            Pensando...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: '8px' }}>
        <input
          className="tc-input"
          placeholder="Mensagem para o assistente..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="tc-btn-primary"
          disabled={loading || !input.trim()}
          style={{ padding: '9px 14px', flexShrink: 0 }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}
