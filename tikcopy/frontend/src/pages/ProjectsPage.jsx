import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Check, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import NicheSelect from '../components/NicheSelect'

function ProjectForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [nicho, setNicho] = useState(initial?.nicho || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await onSave({ name: name.trim(), nicho: nicho.trim() || null, description: description.trim() || null })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: '10px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
        {initial ? 'Editar projeto' : 'Novo projeto'}
      </div>
      <div>
        <label className="tc-label">Nome *</label>
        <input
          className="tc-input"
          placeholder="Ex: Curso de Inglês"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="tc-label">Nicho</label>
        <NicheSelect value={nicho} onChange={setNicho} />
      </div>
      <div>
        <label className="tc-label">Descrição</label>
        <input
          className="tc-input"
          placeholder="Breve descrição do produto ou cliente"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button className="tc-btn-primary" type="submit" disabled={loading || !name.trim()}>
          {loading ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
            background: 'transparent', border: '1px solid var(--border-default)',
            color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function ProjectCard({ project, isActive, onActivate, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDefault = (project.name || '').trim().toLowerCase() === 'geral'

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-default)'}`,
      borderRadius: '10px',
      padding: '16px',
      position: 'relative',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px' }}>
        {isDefault && (
          <div style={{
            background: 'var(--bg-active)', borderRadius: '999px',
            padding: '2px 8px', fontSize: '10px', fontWeight: 600,
            color: 'var(--text-secondary)', letterSpacing: '0.04em',
            border: '1px solid var(--border-default)',
          }}>
            PADRÃO
          </div>
        )}
        {isActive && (
          <div style={{
            background: 'var(--accent)', borderRadius: '999px',
            padding: '2px 8px', fontSize: '10px', fontWeight: 600,
            color: '#fff', letterSpacing: '0.04em',
          }}>
            ATIVO
          </div>
        )}
      </div>

      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', paddingRight: isActive ? '60px' : '0' }}>
        {project.name}
      </div>

      {project.nicho && (
        <div style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: '999px',
          background: 'rgba(255,62,94,0.08)', border: '1px solid rgba(255,62,94,0.2)',
          fontSize: '11px', color: 'var(--accent)', marginBottom: '8px',
        }}>
          {project.nicho}
        </div>
      )}

      {project.description && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>
          {project.description}
        </div>
      )}

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Criado em {new Date(project.created_at).toLocaleDateString('pt-BR')}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {!isActive && (
          <button
            onClick={() => onActivate(project)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
              background: 'var(--accent)', color: '#fff', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
            }}
          >
            <Check size={12} /> Ativar
          </button>
        )}
        {!isDefault && (
          <button
            onClick={() => onEdit(project)}
            style={{
              padding: '6px 10px', borderRadius: '6px', fontSize: '12px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <Pencil size={11} /> Editar
          </button>
        )}
        {isDefault ? null : confirmDelete ? (
          <>
            <button
              onClick={() => onDelete(project.id)}
              style={{
                padding: '6px 10px', borderRadius: '6px', fontSize: '12px',
                background: 'rgba(255,62,94,0.1)', border: '1px solid rgba(255,62,94,0.3)',
                color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Confirmar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: '6px 10px', borderRadius: '6px', fontSize: '12px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: '6px 8px', borderRadius: '6px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

const isDemo = (user) => user?.id === 'demo'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { activeProject, setActiveProject, user } = useAppStore()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)

  const demo = isDemo(user)

  const fetchProjects = async () => {
    if (demo) { setLoading(false); return }
    try {
      const res = await api.get('/projects')
      setProjects(res.data)
    } catch {
      toast.error('Erro ao carregar projetos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [])

  const handleEdit = async (data) => {
    if (demo) {
      const updated = { ...editingProject, ...data }
      setProjects((prev) => prev.map((p) => p.id === editingProject.id ? updated : p))
      if (activeProject?.id === editingProject.id) setActiveProject(updated)
      setEditingProject(null)
      toast.success('Projeto atualizado!')
      return
    }
    try {
      const res = await api.patch(`/projects/${editingProject.id}`, data)
      setProjects((prev) => prev.map((p) => p.id === editingProject.id ? res.data : p))
      if (activeProject?.id === editingProject.id) setActiveProject(res.data)
      setEditingProject(null)
      toast.success('Projeto atualizado!')
    } catch {
      toast.error('Erro ao atualizar projeto')
    }
  }

  const handleDelete = async (id) => {
    if (demo) {
      setProjects((prev) => prev.filter((p) => p.id !== id))
      if (activeProject?.id === id) setActiveProject(null)
      toast.success('Projeto removido')
      return
    }
    try {
      await api.delete(`/projects/${id}`)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      if (activeProject?.id === id) setActiveProject(null)
      toast.success('Projeto removido')
    } catch {
      toast.error('Erro ao remover projeto')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
            Meus Projetos
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Organize suas transcrições e copies por produto ou cliente.
          </p>
        </div>
        {!editingProject && (
          <button
            onClick={() => navigate('/projects/new')}
            className="tc-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> Novo projeto
          </button>
        )}
      </div>

      {editingProject && (
        <div style={{ marginBottom: '20px', maxWidth: '480px' }}>
          <ProjectForm
            initial={editingProject}
            onSave={handleEdit}
            onCancel={() => { setShowForm(false); setEditingProject(null) }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando...</div>
      ) : projects.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          border: '1px dashed var(--border-default)', borderRadius: '12px',
          color: 'var(--text-muted)',
        }}>
          <FolderOpen size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Nenhum projeto ainda</div>
          <div style={{ fontSize: '12px', marginBottom: '16px' }}>Crie o primeiro pra a IA conhecer o produto.</div>
          <button
            onClick={() => navigate('/projects/new')}
            className="tc-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> Novo projeto
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
        }}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={activeProject?.id === project.id}
              onActivate={setActiveProject}
              onEdit={(p) => { setShowForm(false); setEditingProject(p) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
