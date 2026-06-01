import { useState, useEffect, useRef, useMemo } from 'react'
import { Upload, FileText, Link as LinkIcon, Type as TypeIcon, Trash2, ExternalLink, Plus, X, Loader2, Search, Users, Folder, Sparkles, Check, CheckCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import NicheSelect from '../components/NicheSelect'
import { confirmAction } from '../stores/useConfirmStore'

/**
 * Pesquisas = biblioteca livre por NICHO + PÚBLICO.
 * Compartilhada entre projetos do mesmo nicho do usuário.
 *
 * Tipos de doc:
 *   - upload : arquivo (PDF/DOCX/TXT/MD)
 *   - text   : texto colado
 *   - link   : URL + nota
 */

const TYPE_META = {
  upload: { label: 'ARQUIVO', icon: FileText, bg: 'rgba(37,99,235,0.1)',  fg: '#1d4ed8' },
  text:   { label: 'TEXTO',   icon: TypeIcon, bg: 'rgba(100,116,139,0.1)', fg: '#475569' },
  link:   { label: 'LINK',    icon: LinkIcon, bg: 'rgba(245,158,11,0.1)',  fg: '#d97706' },
}

const FILE_TYPE_LABEL = {
  pdf: 'PDF', docx: 'DOCX', doc: 'DOC', txt: 'TXT', md: 'MD',
}

function DocCard({ doc, publicos, onOpen, onDelete, onLink, linking, busy, linked, projectName }) {
  const meta = TYPE_META[doc.type] || TYPE_META.text
  const Icon = meta.icon
  const publico = publicos.find(p => p.id === doc.publico_id)
  const sizeMb = doc.file_size_bytes ? `${(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : null
  const isLinking = linking === doc.id

  return (
    <div
      onClick={() => onOpen(doc)}
      style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        borderRadius: '10px', padding: '14px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        cursor: doc.type === 'upload' || doc.type === 'link' ? 'pointer' : 'default',
        transition: 'border-color 0.15s', fontFamily: 'var(--font)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
          background: meta.bg, color: meta.fg, letterSpacing: '0.04em',
        }}>
          {doc.type === 'upload' && doc.file_ext ? FILE_TYPE_LABEL[doc.file_ext] || meta.label : meta.label}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(doc.type === 'upload' || doc.type === 'link') && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(doc) }}
              title="Abrir"
              style={{
                padding: '5px', borderRadius: '5px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
              }}
            ><ExternalLink size={11} /></button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(doc.id) }}
            title="Deletar"
            style={{
              padding: '5px', borderRadius: '5px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          ><Trash2 size={11} /></button>
        </div>
      </div>

      {/* Vincular ao dossiê do projeto ativo */}
      <button
        onClick={(e) => { e.stopPropagation(); if (!busy) onLink(doc) }}
        disabled={busy}
        title={
          isLinking ? 'Atualizando…'
          : linked ? `Já vinculado ao dossiê de "${projectName || 'projeto'}" — clique pra reenviar`
          : projectName ? `Atualizar o dossiê de "${projectName}" com esta pesquisa` : 'Vincular ao dossiê'
        }
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          width: '100%', padding: '9px', borderRadius: '7px', fontSize: '12.5px', fontWeight: 600,
          background: isLinking ? 'var(--bg-active)' : linked ? 'rgba(34,197,94,0.12)' : 'var(--accent)',
          border: `1px solid ${linked && !isLinking ? 'rgba(34,197,94,0.4)' : 'var(--accent)'}`,
          color: isLinking ? 'var(--text-muted)' : linked ? '#16a34a' : '#fff',
          cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
          boxShadow: (isLinking || linked) ? 'none' : '0 1px 3px rgba(255,62,94,0.3)',
          opacity: busy && !isLinking ? 0.55 : 1,
        }}
      >
        {isLinking
          ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Atualizando dossiê…</>
          : linked
            ? <><Check size={13} /> Vinculado</>
            : <><Sparkles size={12} /> Vincular ao dossiê</>}
      </button>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{
          width: '40px', height: '48px', borderRadius: '6px', flexShrink: 0,
          background: meta.bg, color: meta.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
            lineHeight: 1.35, wordBreak: 'break-word',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {doc.title}
          </div>
          {sizeMb && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
              {sizeMb}
            </div>
          )}
          {doc.type === 'text' && doc.content && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {doc.content.slice(0, 200)}
            </div>
          )}
          {doc.type === 'link' && doc.source_url && (
            <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px', wordBreak: 'break-all' }}>
              {doc.source_url}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <span style={{
          fontSize: '10px', padding: '2px 7px', borderRadius: '999px',
          background: 'var(--bg-active)', color: 'var(--text-muted)',
          display: 'inline-flex', alignItems: 'center', gap: '4px',
        }}>
          <Users size={9} /> {publico?.nome || 'Geral do nicho'}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {new Date(doc.created_at).toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
  )
}

// ─── Modal: Adicionar texto ou link ─────────────────────────────────────────

function AddTextOrLinkModal({ kind, nicho, publicoId, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Coloque um título')
    if (kind === 'text' && !text.trim()) return toast.error('Cole o texto')
    if (kind === 'link' && !url.trim()) return toast.error('Cole a URL')
    setSaving(true)
    try {
      const payload = {
        nicho,
        publico_id: publicoId || null,
        title: title.trim(),
        type: kind,
        ...(kind === 'text' ? { content: text } : {}),
        ...(kind === 'link' ? { source_url: url.trim(), content: text || null } : {}),
      }
      const res = await api.post('/research-docs', payload)
      onCreated(res.data)
      onClose()
      toast.success(kind === 'text' ? 'Texto salvo!' : 'Link salvo!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '14px', padding: '24px',
        width: '100%', maxWidth: '560px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>
            {kind === 'text' ? 'Colar texto' : 'Salvar link'}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>
        <div>
          <label className="tc-label">Título *</label>
          <input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required placeholder="Ex: Comentários do canal X sobre menopausa" />
        </div>
        {kind === 'link' && (
          <div>
            <label className="tc-label">URL *</label>
            <input className="tc-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://..." />
          </div>
        )}
        <div>
          <label className="tc-label">{kind === 'text' ? 'Conteúdo *' : 'Nota / observação'}</label>
          <textarea
            className="tc-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={kind === 'text' ? 10 : 4}
            placeholder={kind === 'text' ? 'Cole aqui o conteúdo da pesquisa…' : 'Por que esse link é relevante?'}
            style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{
            padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
            background: 'transparent', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
          }}>Cancelar</button>
          <button type="submit" disabled={saving} className="tc-btn-primary">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Modal: criar novo público ──────────────────────────────────────────────

function CreatePublicoModal({ nicho, onClose, onCreated }) {
  const [nome, setNome] = useState('')
  const [saving, setSaving] = useState(false)
  const handleSave = async (e) => {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    try {
      const res = await api.post('/publicos', { nicho, nome: nome.trim() })
      onCreated(res.data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar público')
    } finally { setSaving(false) }
  }
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '14px', padding: '24px',
        width: '100%', maxWidth: '420px',
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: 600 }}>Novo público em "{nicho}"</div>
        <div>
          <label className="tc-label">Nome</label>
          <input className="tc-input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="Ex: Mulher pós-parto" />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{
            padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
            background: 'transparent', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancelar</button>
          <button type="submit" disabled={saving} className="tc-btn-primary">
            {saving ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────

export default function ResearchesPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const projectNiche = activeProject?.nicho || ''

  const [nicho, setNicho] = useState(projectNiche)
  const [publicos, setPublicos] = useState([])
  const [publicoFilter, setPublicoFilter] = useState('') // '' = todos, 'geral' = só geral, id = específico
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const [showPublicoModal, setShowPublicoModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(null) // 'text' | 'link' | null
  const [uploading, setUploading] = useState(false)
  const [linkingId, setLinkingId] = useState(null) // id da pesquisa sendo vinculada ao dossiê
  const [bulkLinking, setBulkLinking] = useState(false)
  const [linkedIds, setLinkedIds] = useState(() => new Set()) // pesquisas já vinculadas ao projeto ativo
  const fileRef = useRef(null)

  // Sincroniza nicho ao trocar de projeto
  useEffect(() => {
    if (projectNiche) setNicho(projectNiche)
  }, [projectNiche])

  // Carrega públicos do nicho
  useEffect(() => {
    if (!nicho) { setPublicos([]); return }
    api.get('/publicos', { params: { nicho } })
      .then((r) => setPublicos(r.data || []))
      .catch(() => setPublicos([]))
  }, [nicho])

  // Carrega docs do nicho
  useEffect(() => {
    if (!nicho) { setDocs([]); return }
    setLoading(true)
    api.get('/research-docs', { params: { nicho } })
      .then((r) => setDocs(r.data || []))
      .catch(() => toast.error('Erro ao carregar pesquisas'))
      .finally(() => setLoading(false))
  }, [nicho])

  // Carrega quais pesquisas já estão vinculadas ao dossiê do projeto ativo
  useEffect(() => {
    if (!activeProject?.id) { setLinkedIds(new Set()); return }
    api.get(`/offers/${activeProject.id}`)
      .then((r) => setLinkedIds(new Set(r.data?.linked_doc_ids || [])))
      .catch(() => setLinkedIds(new Set()))
  }, [activeProject?.id])

  const filtered = useMemo(() => {
    let list = docs
    if (publicoFilter === 'geral') {
      list = list.filter(d => !d.publico_id)
    } else if (publicoFilter && publicoFilter !== '') {
      // Específico: mostra do público + gerais (dores universais do nicho valem pra todos)
      list = list.filter(d => d.publico_id === publicoFilter || !d.publico_id)
    }
    if (search.trim()) {
      const t = search.toLowerCase()
      list = list.filter(d =>
        (d.title || '').toLowerCase().includes(t) ||
        (d.content || '').toLowerCase().includes(t) ||
        (d.source_url || '').toLowerCase().includes(t)
      )
    }
    return list
  }, [docs, publicoFilter, search])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !nicho) return
    setUploading(true)
    const toastId = toast.loading('Subindo arquivo…')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('nicho', nicho)
      if (publicoFilter && publicoFilter !== 'geral' && publicoFilter !== '') {
        form.append('publico_id', publicoFilter)
      }
      const res = await api.post('/research-docs/upload', form, { timeout: 120_000 })
      setDocs(prev => [res.data, ...prev])
      toast.dismiss(toastId)
      toast.success('Arquivo importado!')
    } catch (err) {
      toast.dismiss(toastId)
      toast.error(err.response?.data?.detail || 'Erro ao subir')
    } finally { setUploading(false) }
  }

  const handleDelete = async (id) => {
    if (!(await confirmAction({ title: 'Deletar esse documento?', confirmLabel: 'Deletar' }))) return
    try {
      await api.delete(`/research-docs/${id}`)
      setDocs(prev => prev.filter(d => d.id !== id))
      toast.success('Removido')
    } catch {
      toast.error('Erro ao deletar')
    }
  }

  const handleOpen = (doc) => {
    if (doc.type === 'upload') {
      window.open(`/research-docs/${doc.id}/view`, '_blank', 'noopener,noreferrer')
    } else if (doc.type === 'link' && doc.source_url) {
      window.open(doc.source_url, '_blank', 'noopener,noreferrer')
    }
  }

  // Faz o poll do job de destilação até terminar.
  const pollBuild = async (jobId) => {
    for (let i = 0; i < 240; i++) {
      try {
        const res = await api.get(`/offers/build/${jobId}`)
        const s = res.data.status
        if (s === 'done') return res.data.result
        if (s === 'error') throw new Error(res.data.error || 'Erro ao atualizar o dossiê')
      } catch (e) {
        if (e.response?.status === 404) throw new Error('Job expirou')
        throw e
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new Error('Timeout — a atualização demorou demais')
  }

  // Vincula a pesquisa ao dossiê do projeto ativo (merge incremental).
  const linkToDossier = async (doc) => {
    if (!activeProject?.id) {
      toast.error('Selecione um projeto ativo pra vincular a pesquisa.')
      return
    }
    const already = linkedIds.has(doc.id)
    const ok = await confirmAction({
      title: already ? 'Reenviar ao dossiê?' : 'Vincular ao dossiê?',
      message: `A IA vai atualizar o dossiê de "${activeProject.name}" com a pesquisa "${doc.title}". Dá pra desfazer depois na aba Projeto.`,
      confirmLabel: already ? 'Reenviar' : 'Vincular',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setLinkingId(doc.id)
    const toastId = toast.loading(`Atualizando o dossiê de "${activeProject.name}"…`)
    try {
      const res = await api.post(`/offers/${activeProject.id}/link-research`, { doc_id: doc.id })
      await pollBuild(res.data.job_id)
      setLinkedIds((prev) => new Set(prev).add(doc.id))
      toast.dismiss(toastId)
      toast.success(`Dossiê de "${activeProject.name}" atualizado com esta pesquisa!`)
    } catch (err) {
      toast.dismiss(toastId)
      toast.error(err.response?.data?.detail || err.message || 'Erro ao vincular ao dossiê')
    } finally {
      setLinkingId(null)
    }
  }

  // Vincula em massa todas as pesquisas ainda não vinculadas (do filtro atual) num único merge.
  const linkAll = async () => {
    if (!activeProject?.id) {
      toast.error('Selecione um projeto ativo pra vincular as pesquisas.')
      return
    }
    const pending = filtered.filter((d) => !linkedIds.has(d.id))
    if (pending.length === 0) {
      toast('Todas as pesquisas visíveis já estão vinculadas.')
      return
    }
    const ok = await confirmAction({
      title: `Vincular ${pending.length} pesquisa${pending.length > 1 ? 's' : ''} ao dossiê?`,
      message: `A IA vai incorporar ${pending.length} pesquisa${pending.length > 1 ? 's' : ''} ao dossiê de "${activeProject.name}" num único merge. Dá pra desfazer depois na aba Projeto.`,
      confirmLabel: 'Vincular tudo',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setBulkLinking(true)
    const toastId = toast.loading(`Vinculando ${pending.length} pesquisas ao dossiê de "${activeProject.name}"…`)
    try {
      const ids = pending.map((d) => d.id)
      const res = await api.post(`/offers/${activeProject.id}/link-research-bulk`, { doc_ids: ids })
      await pollBuild(res.data.job_id)
      const used = res.data?.linked_doc_ids || ids
      setLinkedIds((prev) => { const s = new Set(prev); used.forEach((id) => s.add(id)); return s })
      toast.dismiss(toastId)
      toast.success(`${used.length} pesquisas incorporadas ao dossiê de "${activeProject.name}"!`)
    } catch (err) {
      toast.dismiss(toastId)
      toast.error(err.response?.data?.detail || err.message || 'Erro ao vincular em massa')
    } finally {
      setBulkLinking(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Pesquisas
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Biblioteca livre de pesquisa por nicho e público. Use <strong>Vincular ao dossiê</strong> em qualquer
          pesquisa pra a IA atualizar o dossiê do projeto ativo
          {activeProject?.name ? <> (<strong>{activeProject.name}</strong>)</> : ''}, preservando o que já existe.
        </p>
      </div>

      {/* Seletor de nicho + público */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        borderRadius: '10px', padding: '14px 16px', marginBottom: '16px',
        display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="tc-label" style={{ fontSize: '11px' }}>
            <Folder size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Nicho
          </label>
          <NicheSelect value={nicho} onChange={setNicho} />
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="tc-label" style={{ fontSize: '11px' }}>
            <Users size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Público
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select
              className="tc-input"
              value={publicoFilter}
              onChange={(e) => setPublicoFilter(e.target.value)}
              disabled={!nicho}
              style={{ flex: 1, fontSize: '13px' }}
            >
              <option value="">Todos os públicos</option>
              <option value="geral">Apenas geral do nicho</option>
              {publicos.length > 0 && <option disabled>──────────</option>}
              {publicos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowPublicoModal(true)}
              disabled={!nicho}
              title="Criar novo público"
              style={{
                padding: '6px 10px', borderRadius: '6px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-muted)', cursor: nicho ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center',
              }}
            ><Plus size={12} /></button>
          </div>
        </div>
      </div>

      {/* Ações de criar doc */}
      {nicho && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={handleUpload} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="tc-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
          >
            {uploading
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Subindo…</>
              : <><Upload size={12} /> Upload arquivo</>
            }
          </button>
          <button
            onClick={() => setShowAddModal('text')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          ><TypeIcon size={12} /> Colar texto</button>
          <button
            onClick={() => setShowAddModal('link')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          ><LinkIcon size={12} /> Salvar link</button>

          {activeProject?.id && filtered.length > 0 && (
            <button
              onClick={linkAll}
              disabled={bulkLinking || !!linkingId}
              title={`Vincular todas as pesquisas visíveis ainda não vinculadas ao dossiê de "${activeProject.name}"`}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                background: 'rgba(255,62,94,0.08)', border: '1px solid rgba(255,62,94,0.3)',
                color: 'var(--accent)', cursor: (bulkLinking || linkingId) ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font)', opacity: (bulkLinking || linkingId) ? 0.6 : 1,
              }}
            >
              {bulkLinking
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Vinculando tudo…</>
                : <><CheckCheck size={13} /> Vincular tudo ao dossiê</>}
            </button>
          )}

          <div style={{ position: 'relative', flex: 1, minWidth: '200px', marginLeft: 'auto' }}>
            <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="tc-input"
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: '12px', padding: '7px 10px 7px 30px', width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {!nicho ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          border: '1px dashed var(--border-default)', borderRadius: '10px',
        }}>
          <Folder size={28} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Escolha um nicho
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Pesquisas são organizadas por nicho. Selecione um acima pra começar.
          </div>
        </div>
      ) : loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          border: '1px dashed var(--border-default)', borderRadius: '10px',
        }}>
          <FileText size={28} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {docs.length === 0 ? 'Nenhuma pesquisa nesse nicho ainda' : 'Nada encontrado'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {docs.length === 0
              ? 'Suba um arquivo, cole um texto ou salve um link pra começar.'
              : 'Tente outro termo ou limpe os filtros.'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '12px',
        }}>
          {filtered.map(d => (
            <DocCard key={d.id} doc={d} publicos={publicos} onOpen={handleOpen} onDelete={handleDelete}
              onLink={linkToDossier} linking={linkingId} busy={!!linkingId || bulkLinking}
              linked={linkedIds.has(d.id)} projectName={activeProject?.name} />
          ))}
        </div>
      )}

      {showPublicoModal && (
        <CreatePublicoModal
          nicho={nicho}
          onClose={() => setShowPublicoModal(false)}
          onCreated={(p) => setPublicos(prev => [...prev, p].sort((a, b) => a.nome.localeCompare(b.nome)))}
        />
      )}

      {showAddModal && (
        <AddTextOrLinkModal
          kind={showAddModal}
          nicho={nicho}
          publicoId={publicoFilter && publicoFilter !== 'geral' ? publicoFilter : null}
          onClose={() => setShowAddModal(null)}
          onCreated={(d) => setDocs(prev => [d, ...prev])}
        />
      )}
    </div>
  )
}
