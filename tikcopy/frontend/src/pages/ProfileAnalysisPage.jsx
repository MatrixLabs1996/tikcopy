import { useState, useEffect, useMemo } from 'react'
import { Radar, Eye, Heart, Check, Save, Loader2, MessageSquare, ThumbsUp, AlertCircle, Calendar, Play, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import useJobsStore, { isActive } from '../stores/useJobsStore'
import NicheSelect from '../components/NicheSelect'
import Markdown from '../components/Markdown'
import DownloadMenu from '../components/DownloadMenu'

const TOP_OPTIONS = [3, 5, 10]

const STATUS_LABEL = {
  queued: 'Na fila…',
  listing: 'Listando os vídeos do perfil…',
  transcribing: 'Transcrevendo os vídeos virais…',
  reading_comments: 'Lendo os comentários (voz da audiência)…',
  analyzing: 'Analisando padrões e voz da audiência com IA…',
}

// ── Card de um vídeo analisado, com checkbox pra mandar pro Swipe ──
function VideoRow({ video, videoIndex, checked, onToggle, selectedComments, onToggleComment }) {
  const m = video.metrics || {}
  const [showComments, setShowComments] = useState(false)
  const [commentSearch, setCommentSearch] = useState('')
  const comments = video.top_comments || []
  const search = commentSearch.trim().toLowerCase()
  const visibleComments = comments
    .map((c, ci) => ({ c, ci }))
    .filter(({ c }) => !search || (c.text || '').toLowerCase().includes(search))
  const selCount = comments.reduce((n, _, ci) => n + (selectedComments[`${videoIndex}:${ci}`] ? 1 : 0), 0)
  return (
    <div style={{
      border: '1px solid var(--border-default)', borderRadius: '9px',
      background: checked ? 'rgba(255,62,94,0.06)' : 'var(--bg-elevated)',
      transition: 'background 0.12s', overflow: 'hidden',
    }}>
      <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{ marginTop: '3px', cursor: 'pointer' }} />
        {video.thumbnail && (
          <img
            src={video.thumbnail}
            alt=""
            style={{ width: '120px', height: '68px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, border: '1px solid var(--border-default)' }}
            loading="lazy"
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {video.title || 'Sem título'}
            </div>
            {video.url && (
              <a href={video.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                  fontSize: '11px', fontWeight: 500, color: 'var(--accent)', textDecoration: 'none',
                  border: '1px solid var(--border-default)', borderRadius: '6px', padding: '4px 9px',
                }} title="Abrir vídeo no YouTube">
                <Play size={11} /> Assistir
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', flexWrap: 'wrap' }}>
            {m.views && m.views !== '—' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Eye size={11} /> {m.views}</span>}
            {m.likes && m.likes !== '—' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Heart size={11} /> {m.likes}</span>}
            {m.published && m.published !== '—' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Data de postagem"><Calendar size={11} /> {m.published}</span>}
            {video.velocity > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontWeight: 600 }} title="Views por dia (em alta)"><TrendingUp size={11} /> {Number(video.velocity).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}/dia</span>}
            {(video.comment_count || comments.length) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MessageSquare size={11} /> {(video.comment_count || comments.length).toLocaleString('pt-BR')} comentários lidos</span>}
          </div>
          {video.hook && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
              {video.hook.length > 160 ? video.hook.slice(0, 160) + '…' : video.hook}
            </div>
          )}
          {video.description && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
              <span style={{ fontWeight: 600 }}>Descrição: </span>
              {video.description.length > 240 ? video.description.slice(0, 240) + '…' : video.description}
            </div>
          )}
        </div>
      </label>

      {comments.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setShowComments((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
              padding: '8px 14px', background: 'transparent', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: '11px', textAlign: 'left',
            }}
          >
            <MessageSquare size={12} /> {showComments ? 'Ocultar' : 'Ver e selecionar'} comentários
            {selCount > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>· {selCount} marcado{selCount > 1 ? 's' : ''}</span>}
          </button>
          {showComments && (
            <div style={{ padding: '0 14px 12px' }}>
              {/* Busca dentro dos comentários */}
              <input
                value={commentSearch}
                onChange={(e) => setCommentSearch(e.target.value)}
                placeholder="Buscar nos comentários (ex: palavra do tema)…"
                style={{
                  width: '100%', boxSizing: 'border-box', marginBottom: '10px',
                  background: 'var(--bg-base)', border: '1px solid var(--border-default)',
                  borderRadius: '6px', padding: '7px 10px', fontSize: '12px',
                  color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
                {visibleComments.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 0' }}>Nenhum comentário encontrado.</div>
                )}
                {visibleComments.map(({ c, ci }) => {
                  const key = `${videoIndex}:${ci}`
                  const isSel = !!selectedComments[key]
                  return (
                    <label key={ci} style={{
                      display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer',
                      padding: '6px 8px', borderRadius: '6px',
                      background: isSel ? 'rgba(255,62,94,0.08)' : 'transparent',
                      borderLeft: `2px solid ${isSel ? 'var(--accent)' : 'var(--border-default)'}`,
                    }}>
                      <input type="checkbox" checked={isSel} onChange={() => onToggleComment(videoIndex, ci, c, video.title)} style={{ marginTop: '2px', cursor: 'pointer' }} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-muted)', fontSize: '10px', marginRight: '6px' }}>
                          <ThumbsUp size={10} /> {c.likes}
                        </span>
                        {c.text}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProfileAnalysisPage() {
  const activeProject = useAppStore((s) => s.activeProject)

  const [url, setUrl] = useState('')
  const [topN, setTopN] = useState(5)
  const [niche, setNiche] = useState('')
  const [theme, setTheme] = useState('')
  const [rankBy, setRankBy] = useState('views')   // 'views' | 'relevance'
  const [videoType, setVideoType] = useState('both')   // 'both' | 'long' | 'shorts'
  const [includeComments, setIncludeComments] = useState(true)

  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState({}) // vídeos marcados pro swipe { index: true }
  const [selectedComments, setSelectedComments] = useState({}) // comentários marcados { 'vi:ci': {text,likes,videoTitle} }
  const [savingDoc, setSavingDoc] = useState(false)
  const [savedDoc, setSavedDoc] = useState(false)
  const [sendingSwipe, setSendingSwipe] = useState(false)

  // Job vive no store GLOBAL (sobrevive a trocar de aba / sair da página).
  // O poller global (TranscriptionDock) acompanha o progresso pra gente.
  const jobs = useJobsStore((s) => s.jobs)
  const addJobs = useJobsStore((s) => s.addJobs)
  const removeJob = useJobsStore((s) => s.removeJob)
  const updateJob = useJobsStore((s) => s.updateJob)
  const job = useMemo(() => jobs.find((j) => j.kind === 'profile') || null, [jobs])
  const running = !!job && isActive(job)
  const result = job?.status === 'done' ? job.result : null

  // Sincroniza nicho com o projeto ativo
  useEffect(() => {
    setNiche(activeProject?.nicho || '')
  }, [activeProject?.id, activeProject?.nicho])

  const handleStart = async (e) => {
    e.preventDefault()
    if (!url.trim()) return toast.error('Cole o link do perfil')
    setSubmitting(true)
    setSelected({})
    setSavedDoc(false)
    // Remove análise anterior do Raio-X (só uma por vez nesta tela)
    if (job) removeJob(job.id)
    try {
      const res = await api.post('/profile-analysis/start', {
        url: url.trim(), top_n: topN, niche: niche || null,
        theme: theme.trim() || null, rank_by: rankBy, video_type: videoType,
        include_comments: includeComments,
      })
      addJobs([{
        id: res.data.job_id,
        kind: 'profile',
        endpoint: '/profile-analysis',
        label: theme.trim() ? `${url.trim()} · ${theme.trim()}` : url.trim(),
        status: 'queued',
      }])
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha ao iniciar análise')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveDoc = async () => {
    if (!result?.document) return
    const nichoFinal = niche || result?.niche
    if (!nichoFinal) return toast.error('Selecione um nicho pra salvar em Pesquisas')
    setSavingDoc(true)
    try {
      await api.post('/research-docs', {
        nicho: nichoFinal,
        title: `Raio-X — ${result.author || 'perfil'}`,
        type: 'text',
        content: result.document,
        source_url: url.trim() || null,
        source_platform: 'youtube',
        imported_via: 'profile-analysis',
      })
      setSavedDoc(true)
      toast.success('Documento salvo em Pesquisas!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar em Pesquisas')
    } finally {
      setSavingDoc(false)
    }
  }

  const toggleSel = (i) => setSelected((prev) => ({ ...prev, [i]: !prev[i] }))

  const toggleComment = (vi, ci, comment, videoTitle) => {
    const key = `${vi}:${ci}`
    setSelectedComments((prev) => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = { text: comment.text, likes: comment.likes, videoTitle }
      return next
    })
  }

  const commentSelCount = Object.keys(selectedComments).length

  // Aplica os comentários marcados como uma seção do documento (regenera a cada vez)
  const MARKER = '## Comentários selecionados'
  const applyCommentsToDoc = () => {
    if (!result?.document || !job) return
    const sel = Object.values(selectedComments)
    let doc = result.document
    const idx = doc.indexOf(MARKER)
    if (idx !== -1) doc = doc.slice(0, idx).trimEnd()   // remove seção anterior
    if (sel.length > 0) {
      // Agrupa por vídeo
      const byVideo = {}
      for (const c of sel) {
        const t = c.videoTitle || 'Vídeo'
        ;(byVideo[t] = byVideo[t] || []).push(c)
      }
      const parts = [MARKER, '', 'Comentários curados manualmente como voz do cliente (verbatim):', '']
      for (const [vt, list] of Object.entries(byVideo)) {
        parts.push(`### ${vt}`)
        for (const c of list) parts.push(`- "${c.text}"${c.likes ? ` (${c.likes} curtidas)` : ''}`)
        parts.push('')
      }
      doc = `${doc}\n\n${parts.join('\n').trimEnd()}`
    }
    updateJob(job.id, { result: { ...result, document: doc } })
    setSavedDoc(false)   // documento mudou, libera re-salvar em Pesquisas
    toast.success(sel.length ? `${sel.length} comentário${sel.length > 1 ? 's' : ''} adicionado${sel.length > 1 ? 's' : ''} ao documento` : 'Seção de comentários removida')
  }

  const handleSendSwipe = async () => {
    const idxs = Object.keys(selected).filter((k) => selected[k]).map(Number)
    if (idxs.length === 0) return toast.error('Marque pelo menos um vídeo')
    const nichoFinal = niche || result?.niche
    if (!nichoFinal) return toast.error('Selecione um nicho pra mandar pro Swipe')
    setSendingSwipe(true)
    let ok = 0
    for (const i of idxs) {
      const v = result.videos[i]
      if (!v) continue
      try {
        await api.post('/swipes', {
          tag: 'organico',
          content: JSON.stringify({
            title: v.title || 'Vídeo orgânico',
            hook: v.hook || '',
            body: v.body || '',
            transcript_full: v.transcript || '',
            source_video_url: v.url || null,
            niche: nichoFinal,
            format: '',
            observations: '',
            metadata: v.metrics || null,
          }),
          source: v.url || null,
        })
        ok++
      } catch { /* segue */ }
    }
    setSendingSwipe(false)
    if (ok) {
      toast.success(`${ok} vídeo${ok > 1 ? 's' : ''} salvo${ok > 1 ? 's' : ''} no Swipe File (nicho: ${nichoFinal})`)
      setSelected({})
    } else {
      toast.error('Não consegui salvar no Swipe')
    }
  }

  const docName = `raio-x-${(result?.author || 'perfil').replace(/[^a-zA-Z0-9À-ú _-]/g, '').trim() || 'perfil'}`

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radar size={20} style={{ color: 'var(--accent)' }} /> Raio-X de <span style={{ color: 'var(--accent)' }}>Perfil</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Cole o link de um canal do YouTube. A IA pega os vídeos mais virais, transcreve e entrega um documento com os padrões que funcionam.
        </p>
      </div>

      {/* Formulário */}
      <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '620px', marginBottom: '24px' }}>
        <div>
          <label className="tc-label">Link do perfil (YouTube)</label>
          <input
            className="tc-input"
            placeholder="https://www.youtube.com/@canal"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
          />
        </div>

        <div>
          <label className="tc-label">
            Filtrar por tema <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
          </label>
          <input
            className="tc-input"
            placeholder="ex: disfunção erétil — deixe vazio pra pegar o top do canal inteiro"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            disabled={running}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Se o canal mistura vários assuntos, preencha pra analisar só os vídeos virais sobre esse tema.
          </div>
        </div>

        <div>
          <label className="tc-label">Ranquear por</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'views', label: 'Mais views', desc: 'campeões históricos' },
              { id: 'relevance', label: 'Em alta', desc: 'views por tempo, o que bomba agora' },
            ].map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => setRankBy(opt.id)}
                disabled={running}
                title={opt.desc}
                style={{
                  padding: '8px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                  cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
                  background: rankBy === opt.id ? 'var(--accent)' : 'transparent',
                  color: rankBy === opt.id ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${rankBy === opt.id ? 'var(--accent)' : 'var(--border-default)'}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {rankBy === 'relevance'
              ? 'Em alta: prioriza vídeos com mais views por tempo (recentes que estão explodindo), não os campeões antigos.'
              : 'Mais views: os vídeos mais vistos do canal inteiro (favorece os mais antigos, que acumularam views).'}
          </div>
        </div>

        <div>
          <label className="tc-label">Tipo de vídeo</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'both', label: 'Os dois' },
              { id: 'long', label: 'Longos' },
              { id: 'shorts', label: 'Shorts' },
            ].map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => setVideoType(opt.id)}
                disabled={running}
                style={{
                  padding: '8px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                  cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
                  background: videoType === opt.id ? 'var(--accent)' : 'transparent',
                  color: videoType === opt.id ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${videoType === opt.id ? 'var(--accent)' : 'var(--border-default)'}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Shorts = vídeos de até 3 minutos. Longos = o resto. São jogos diferentes de copy.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="tc-label">Analisar os top</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {TOP_OPTIONS.map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => setTopN(n)}
                  disabled={running}
                  style={{
                    padding: '8px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                    cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
                    background: topN === n ? 'var(--accent)' : 'transparent',
                    color: topN === n ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${topN === n ? 'var(--accent)' : 'var(--border-default)'}`,
                  }}
                >
                  {n}
                </button>
              ))}
              <span style={{ alignSelf: 'center', fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>vídeos virais</span>
            </div>
          </div>

          <div style={{ minWidth: '220px' }}>
            <label className="tc-label">
              Nicho
              {activeProject?.nicho && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--accent)', fontWeight: 500 }}>· do "{activeProject.name}"</span>}
            </label>
            <NicheSelect value={niche} onChange={setNiche} />
          </div>
        </div>

        {/* Toggle: incluir voz da audiência (comentários) */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: running ? 'not-allowed' : 'pointer', userSelect: 'none' }}>
          <div
            onClick={() => !running && setIncludeComments((v) => !v)}
            style={{ width: '36px', height: '20px', borderRadius: '999px', background: includeComments ? 'var(--accent)' : 'var(--border-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
          >
            <div style={{ position: 'absolute', top: '3px', left: includeComments ? '18px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: '13px', color: includeComments ? 'var(--text-secondary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <MessageSquare size={13} /> Incluir voz da audiência (lê os comentários dos vídeos)
          </span>
        </label>

        <div>
          <button className="tc-btn-primary" type="submit" disabled={submitting || running}>
            {running ? 'Analisando…' : submitting ? 'Iniciando…' : 'Analisar perfil'}
          </button>
        </div>
      </form>

      {/* Progresso */}
      {running && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '9px', marginBottom: '24px', maxWidth: '620px',
        }}>
          <Loader2 size={16} className="tc-spin" style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {STATUS_LABEL[job.status] || 'Processando…'}
            {job.status === 'transcribing' && job.progress && (
              <span style={{ color: 'var(--text-muted)' }}> ({job.progress.current}/{job.progress.total})</span>
            )}
          </div>
        </div>
      )}

      {/* Erro */}
      {job?.status === 'error' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 16px',
          background: 'rgba(255,62,94,0.06)', border: '1px solid rgba(255,62,94,0.2)',
          borderRadius: '9px', marginBottom: '24px', maxWidth: '620px',
        }}>
          <AlertCircle size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
          <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {job.error || 'Erro na análise'}
          </div>
          <button onClick={() => removeJob(job.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px' }}>
            dispensar
          </button>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Ações do documento */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginRight: 'auto' }}>
              Padrões de {result.author || 'perfil'} ({result.videos?.length || 0} vídeos)
            </div>
            <button
              onClick={handleSaveDoc}
              disabled={savingDoc || savedDoc}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                borderRadius: '7px', fontSize: '12px', fontFamily: 'var(--font)',
                cursor: savedDoc ? 'default' : 'pointer',
                background: 'transparent',
                border: `1px solid ${savedDoc ? 'var(--success-text)' : 'var(--border-default)'}`,
                color: savedDoc ? 'var(--success-text)' : 'var(--text-secondary)',
              }}
            >
              {savedDoc ? <><Check size={13} /> Salvo em Pesquisas</> : <><Save size={13} /> {savingDoc ? 'Salvando…' : 'Salvar em Pesquisas'}</>}
            </button>
            <DownloadMenu filename={docName} content={result.document} />
          </div>

          {/* Documento */}
          <div style={{
            padding: '18px 20px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)', borderRadius: '10px',
          }}>
            <Markdown>{result.document}</Markdown>
          </div>

          {/* Vídeos analisados → Swipe + curadoria de comentários */}
          {result.videos?.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Vídeos analisados
                </div>
                <button
                  onClick={handleSendSwipe}
                  disabled={sendingSwipe}
                  className="tc-btn-primary"
                  style={{ padding: '7px 14px', fontSize: '12px' }}
                >
                  {sendingSwipe ? 'Enviando…' : 'Enviar selecionados ao Swipe'}
                </button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Marque os vídeos pra mandar pro Swipe. Em cada um, abra "Ver e selecionar comentários" pra escolher a dedo os relevantes (use a busca pra filtrar por tema).
              </div>

              {/* Barra de curadoria de comentários */}
              {commentSelCount > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                  padding: '10px 14px', marginBottom: '12px', borderRadius: '9px',
                  background: 'rgba(255,62,94,0.06)', border: '1px solid rgba(255,62,94,0.25)',
                }}>
                  <MessageSquare size={14} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--accent)' }}>{commentSelCount}</strong> comentário{commentSelCount > 1 ? 's' : ''} selecionado{commentSelCount > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={applyCommentsToDoc}
                    className="tc-btn-primary"
                    style={{ padding: '6px 12px', fontSize: '12px', marginLeft: 'auto' }}
                  >
                    Adicionar ao documento
                  </button>
                  <button
                    onClick={() => setSelectedComments({})}
                    style={{ padding: '6px 10px', fontSize: '12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '7px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Limpar
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {result.videos.map((v, i) => (
                  <VideoRow
                    key={i}
                    video={v}
                    videoIndex={i}
                    checked={!!selected[i]}
                    onToggle={() => toggleSel(i)}
                    selectedComments={selectedComments}
                    onToggleComment={toggleComment}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`.tc-spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
