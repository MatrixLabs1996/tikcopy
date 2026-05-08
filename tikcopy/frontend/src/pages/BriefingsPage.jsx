import { useState, useEffect } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'

export default function BriefingsPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [briefings, setBriefings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [angle, setAngle] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => api.get('/briefings').then((r) => setBriefings(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/briefings', { title, angle, project_id: activeProject?.id || null })
      toast.success('Briefing criado!')
      setTitle(''); setAngle(''); setShowForm(false)
      load()
    } catch {
      toast.error('Erro ao criar briefing')
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
      await api.post('/briefings/upload', form)
      toast.success('Briefing importado com IA!')
      load()
    } catch {
      toast.error('Erro ao importar briefing')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Deletar briefing?')) return
    await api.delete(`/briefings/${id}`)
    setBriefings((prev) => prev.filter((b) => b.id !== id))
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Carregando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>Briefings</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Organize seus briefings de criação.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <label style={{ cursor: 'pointer' }} title="Importar arquivo (Claude extrai os campos)">
            <input type="file" accept=".txt,.pdf,.docx" onChange={handleUpload} style={{ display: 'none' }} />
            <span className="tc-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px' }}>
              <Upload size={13} /> Importar
            </span>
          </label>
          <button className="tc-btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Novo</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="tc-card" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="tc-label">Título</label>
            <input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Nome do briefing" />
          </div>
          <div>
            <label className="tc-label">Ângulo (opcional)</label>
            <input className="tc-input" value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="ex: prova social, dor, transformação..." />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="tc-btn-primary" type="submit" disabled={saving}>{saving ? 'Criando...' : 'Criar'}</button>
            <button className="tc-btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {briefings.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nenhum briefing ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {briefings.map((b) => (
            <div key={b.id} className="tc-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{b.title}</div>
                {b.angle && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{b.angle}</div>}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {new Date(b.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <button className="tc-btn-secondary" style={{ padding: '5px 8px' }} onClick={() => handleDelete(b.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
