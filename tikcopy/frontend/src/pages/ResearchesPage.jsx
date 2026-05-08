import { useState, useEffect } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'

export default function ResearchesPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [researches, setResearches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [market, setMarket] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => api.get('/researches').then((r) => setResearches(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/researches', { title, market: market || null, project_id: activeProject?.id || null })
      toast.success('Pesquisa criada!')
      setTitle(''); setMarket(''); setShowForm(false)
      load()
    } catch {
      toast.error('Erro ao criar pesquisa')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSaving(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (activeProject?.id) form.append('project_id', activeProject.id)
      await api.post('/researches/upload', form)
      toast.success('Pesquisa importada com IA!')
      load()
    } catch {
      toast.error('Erro ao importar pesquisa')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Deletar pesquisa?')) return
    await api.delete(`/researches/${id}`)
    setResearches((prev) => prev.filter((r) => r.id !== id))
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Carregando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>Pesquisas</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Pesquisas de oferta organizadas por projeto.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <label style={{ cursor: 'pointer' }} title="Importar arquivo (Claude extrai os campos)">
            <input type="file" accept=".txt,.pdf,.docx" onChange={handleUpload} style={{ display: 'none' }} />
            <span className="tc-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px' }}>
              <Upload size={13} /> Importar
            </span>
          </label>
          <button className="tc-btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Nova</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="tc-card" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="tc-label">Título</label>
            <input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="ex: Pesquisa Mercado Fitness" />
          </div>
          <div>
            <label className="tc-label">Mercado (opcional)</label>
            <input className="tc-input" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="ex: emagrecimento feminino" />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="tc-btn-primary" type="submit" disabled={saving}>{saving ? 'Criando...' : 'Criar'}</button>
            <button className="tc-btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {researches.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nenhuma pesquisa ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {researches.map((r) => (
            <div key={r.id} className="tc-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</div>
                {r.market && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.market}</div>}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {new Date(r.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <button className="tc-btn-secondary" style={{ padding: '5px 8px' }} onClick={() => handleDelete(r.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
