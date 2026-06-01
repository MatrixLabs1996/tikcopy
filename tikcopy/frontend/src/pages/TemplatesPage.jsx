import { useState, useEffect } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { confirmAction } from '../stores/useConfirmStore'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [niche, setNiche] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => api.get('/templates').then((r) => setTemplates(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/templates', { name, niche: niche || null, fields: [] })
      toast.success('Template criado!')
      setName(''); setNiche(''); setShowForm(false)
      load()
    } catch {
      toast.error('Erro ao criar template')
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicate = async (id) => {
    try {
      await api.post(`/templates/${id}/duplicate`)
      toast.success('Duplicado!')
      load()
    } catch {
      toast.error('Erro ao duplicar')
    }
  }

  const handleDelete = async (id) => {
    if (!(await confirmAction({ title: 'Deletar template?', confirmLabel: 'Deletar' }))) return
    await api.delete(`/templates/${id}`)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Carregando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
            Templates
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Crie estruturas reutilizáveis de copy.
          </p>
        </div>
        <button className="tc-btn-primary" onClick={() => setShowForm(true)} style={{ gap: '6px' }}>
          <Plus size={14} /> Novo template
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="tc-card" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="tc-label">Nome do template</label>
            <input className="tc-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="ex: VSL Curta" />
          </div>
          <div>
            <label className="tc-label">Nicho (opcional)</label>
            <input className="tc-input" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="ex: emagrecimento" />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="tc-btn-primary" type="submit" disabled={saving}>{saving ? 'Criando...' : 'Criar'}</button>
            <button className="tc-btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nenhum template. Crie o primeiro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates.map((t) => (
            <div key={t.id} className="tc-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{t.name}</div>
                {t.niche && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.niche}</div>}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="tc-btn-secondary" style={{ padding: '5px 8px' }} onClick={() => handleDuplicate(t.id)}>
                  <Copy size={12} />
                </button>
                <button className="tc-btn-secondary" style={{ padding: '5px 8px' }} onClick={() => handleDelete(t.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
