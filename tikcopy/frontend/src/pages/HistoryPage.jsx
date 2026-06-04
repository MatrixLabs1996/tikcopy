import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { confirmAction } from '../stores/useConfirmStore'

const TYPE_LABEL = { organic: 'Orgânico', lesson: 'Aula', ad: 'Anúncio' }
const TYPE_COLOR = { organic: 'var(--accent)', lesson: '#4a9eff', ad: 'var(--accent)' }

export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/transcribe/history')
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!(await confirmAction({ title: 'Deletar esta transcrição?', confirmLabel: 'Deletar' }))) return
    await api.delete(`/transcribe/${id}`)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Carregando...</div>

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Histórico
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {items.length} transcrição{items.length !== 1 ? 'ões' : ''} salva{items.length !== 1 ? 's' : ''}
        </p>
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Nenhuma transcrição ainda. Comece em <strong>Vídeos Orgânicos</strong> ou <strong>Anúncios</strong>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => navigate(`/history/${item.id}`)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'border-color 0.12s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-strong)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title || 'Sem título'}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '2px 7px',
                    borderRadius: '999px', background: 'transparent',
                    border: `1px solid ${TYPE_COLOR[item.type]}`,
                    color: TYPE_COLOR[item.type],
                  }}>
                    {TYPE_LABEL[item.type] || item.type}
                  </span>
                  {item.niche && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.niche}</span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(item.id, e)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: '12px', color: 'var(--text-muted)', padding: '4px 8px',
                  borderRadius: '4px', fontFamily: 'var(--font)',
                }}
              >
                Deletar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
