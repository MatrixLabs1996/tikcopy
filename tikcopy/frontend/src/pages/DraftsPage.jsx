import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

export default function DraftsPage() {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => api.get('/drafts').then((r) => setDrafts(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    try {
      await api.post('/drafts', { title: 'Novo Rascunho' })
      toast.success('Rascunho criado!')
      load()
    } catch {
      toast.error('Erro ao criar rascunho')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Deletar rascunho?')) return
    await api.delete(`/drafts/${id}`)
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Carregando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>Rascunhos</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Seus rascunhos de copy em andamento.</p>
        </div>
        <button className="tc-btn-primary" onClick={handleCreate}><Plus size={14} /> Novo rascunho</button>
      </div>

      {drafts.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nenhum rascunho ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {drafts.map((d) => (
            <div key={d.id} className="tc-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{d.title || 'Sem título'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Editado em {new Date(d.updated_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <button className="tc-btn-secondary" style={{ padding: '5px 8px' }} onClick={() => handleDelete(d.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
