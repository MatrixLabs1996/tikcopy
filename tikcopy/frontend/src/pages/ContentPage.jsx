import { useState, useEffect, useMemo } from 'react'
import { Library, Search, Trash2, X, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import Markdown from '../components/Markdown'
import DownloadMenu from '../components/DownloadMenu'
import { confirmAction } from '../stores/useConfirmStore'

// ── Leitor de um guia (abre quando clica num card) ──────────────
function GuideReader({ id, onBack }) {
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [regen, setRegen] = useState(false)

  const loadDoc = () => {
    setLoading(true)
    return api.get(`/transcribe/${id}`)
      .then((r) => setDoc(r.data))
      .catch(() => toast.error('Não foi possível abrir este guia'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadDoc() }, [id]) // eslint-disable-line

  const hasRaw = !!(doc?.metadata?.raw_transcript)

  const regenerate = async () => {
    setRegen(true)
    try {
      const { data } = await api.post(`/transcribe/lessons/${id}/regenerate`)
      const jobId = data.job_id
      // Polling até concluir
      await new Promise((resolve, reject) => {
        const iv = setInterval(async () => {
          try {
            const s = await api.get(`/transcribe/status/${jobId}`)
            if (s.data.status === 'done') { clearInterval(iv); resolve() }
            else if (s.data.status === 'error') { clearInterval(iv); reject(new Error(s.data.error || 'Erro')) }
          } catch (e) { clearInterval(iv); reject(e) }
        }, 3000)
      })
      await loadDoc()
      toast.success('Material regenerado!')
    } catch (e) {
      toast.error(`Falha ao regenerar: ${e.message || 'erro'}`)
    } finally {
      setRegen(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', padding: '40px', justifyContent: 'center' }}>
        <Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} /> Abrindo guia…
      </div>
    )
  }
  if (!doc) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '16px' }}>
        <button
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font)' }}
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasRaw && (
            <button
              onClick={regenerate}
              disabled={regen}
              title="Refaz o material a partir da transcrição (sem re-transcrever)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '6px 10px', cursor: regen ? 'default' : 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font)', opacity: regen ? 0.7 : 1 }}
            >
              <RefreshCw size={14} style={regen ? { animation: 'spin 0.9s linear infinite' } : undefined} />
              {regen ? 'Regenerando…' : 'Regenerar material'}
            </button>
          )}
          <DownloadMenu filename={doc.title || 'guia'} content={doc.transcript_full || ''} label="Baixar guia" />
        </div>
      </div>
      <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{doc.title}</h1>
      {doc.niche && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Nicho: {doc.niche}</div>}
      <div className="tc-result-box">
        <Markdown>{doc.transcript_full || ''}</Markdown>
      </div>
    </div>
  )
}

export default function ContentPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [niche, setNiche] = useState('')
  const [openId, setOpenId] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/transcribe/lessons/list')
      .then((r) => setItems(r.data || []))
      .catch(() => toast.error('Não foi possível carregar o conteúdo'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const niches = useMemo(() => {
    const set = new Set(items.map((i) => i.niche).filter(Boolean))
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (niche && i.niche !== niche) return false
      if (q && !(i.title || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [items, query, niche])

  const handleDelete = async (e, item) => {
    e.stopPropagation()
    const ok = await confirmAction({ title: `Excluir "${item.title}"?`, message: 'O guia será apagado de vez.', confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    try {
      await api.delete(`/transcribe/${item.id}`)
      setItems((prev) => prev.filter((x) => x.id !== item.id))
      toast.success('Guia excluído')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const fmtDate = (d) => {
    try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '' }
  }

  // ── Leitor aberto ──
  if (openId) {
    return (
      <div>
        <GuideReader id={openId} onBack={() => setOpenId(null)} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Library size={20} style={{ color: 'var(--accent)' }} /> Conteúdo
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Sua biblioteca de guias gerados a partir de aulas e podcasts.
        </p>
      </div>

      {/* Busca + filtro */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            placeholder="Buscar por título…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font)' }}
          />
        </div>
        {niches.length > 0 && (
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font)' }}
          >
            <option value="">Todos os nichos</option>
            {niches.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', padding: '40px', justifyContent: 'center' }}>
          <Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} /> Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
          <Library size={32} style={{ opacity: 0.4, marginBottom: '10px' }} />
          <div style={{ fontSize: '14px' }}>
            {items.length === 0 ? 'Nenhum guia ainda. Transcreva uma aula ou podcast pra começar.' : 'Nenhum guia encontrado com esse filtro.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setOpenId(item.id)}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '14px', cursor: 'pointer', transition: 'border-color 0.12s', position: 'relative' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Library size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '6px' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {item.niche && <span>{item.niche}</span>}
                    <span>{fmtDate(item.created_at)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, item)}
                  title="Excluir"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', flexShrink: 0 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
