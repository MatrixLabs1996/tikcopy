import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { Bookmark, Layers, FlaskConical, Upload, X, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Brain, Languages } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { useTranscriptionJob, STATUS_LABELS } from '../hooks/useTranscriptionJob'
import { buildAdTxt } from '../utils/download'
import DownloadMenu from '../components/DownloadMenu'
import Markdown from '../components/Markdown'
import NicheSelect from '../components/NicheSelect'
import usePersistedState, { clearPersistedKeys } from '../hooks/usePersistedState'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function saveHookToSwipe(result, niche) {
  const hook = result?.hook_written
  if (!hook) return toast.error('Nenhum hook para salvar')
  if (!niche || !niche.trim()) {
    return toast.error('Selecione o nicho no topo da página antes de salvar o hook.')
  }
  try {
    await api.post('/swipes', {
      tag: 'hook',
      content: JSON.stringify({
        hook,
        title: result.title || 'Anúncio',
        niche: niche.trim(),
        source: 'ad',          // ← marca a origem
      }),
    })
    toast.success(`Hook salvo no Swipe (nicho: ${niche.trim()})!`)
  } catch {
    toast.error('Erro ao salvar no Swipe')
  }
}

// ─── SaveSwipePanel ───────────────────────────────────────────────────────────

function SaveSwipePanel({ result, niche, projectId, onClose, videoFile }) {
  const [videoUrl, setVideoUrl] = useState('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!niche || !niche.trim()) {
      return toast.error('Selecione o nicho no topo da página antes de salvar no Swipe.')
    }
    const nicheClean = niche.trim()
    setSaving(true)
    try {
      const structured = {
        title: result.title,
        niche: nicheClean,
        format: result.video_format,
        hook_written: result.hook_written,
        hook_visual: result.hook_visual,
        landing_phrase: result.landing_phrase,
        body: result.body,
        avatar: result.avatar,
        observations: obs,
        source_video_url: videoUrl || null,
      }

      if (videoFile) {
        // Sobe o vídeo original pro R2 + salva os campos estruturados juntos.
        // Assim o anúncio no Swipe terá player de vídeo, não só texto.
        const form = new FormData()
        form.append('file', videoFile)
        form.append('tag', 'ad')
        form.append('title', result.title || 'Anúncio')
        form.append('niche', nicheClean)
        if (result.video_format) form.append('formato', result.video_format)
        if (projectId) form.append('project_id', projectId)
        form.append('content_json', JSON.stringify(structured))
        await api.post('/videos/upload-to-swipe', form)
      } else {
        // Sem o arquivo em mãos (ex: recarregou a página) → salva só o texto
        await api.post('/swipes', {
          tag: 'ad', content: JSON.stringify(structured), source: videoUrl || null,
        })
      }

      if (result.avatar && Object.values(result.avatar).some(Boolean)) {
        await api.post('/swipes', {
          tag: 'avatar',
          content: JSON.stringify({ ...result.avatar, niche: nicheClean, title: result.title }),
        }).catch(() => {})
      }
      toast.success(videoFile ? 'Anúncio salvo no Swipe (com vídeo)!' : 'Anúncio salvo no Swipe!')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar no Swipe')
    } finally { setSaving(false) }
  }

  return (
    <div style={{
      marginTop: '16px', padding: '16px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Salvar no Swipe de Ads</div>
      <div>
        <label className="tc-label">Link do vídeo (opcional)</label>
        <input className="tc-input" placeholder="https://..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </div>
      <div>
        <label className="tc-label">Observações (opcional)</label>
        <textarea className="tc-input tc-textarea" placeholder="O que achou interessante neste anúncio?" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="tc-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</button>
        <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── AdResult ────────────────────────────────────────────────────────────────

function AdResult({ result, niche, projectId, videoFile }) {
  const [showSwipe, setShowSwipe] = useState(false)
  if (!result) return null
  const { title, duration, avatar = {}, video_format, editing = {}, hook_visual, hook_written, landing_phrase, body } = result

  const adName = (title || 'anuncio').replace(/[^a-zA-Z0-9À-ú _-]/g, '')

  return (
    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title} · {duration}</div>
        <DownloadMenu filename={adName} content={buildAdTxt(result)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div className="tc-card">
          <div className="tc-section-title" style={{ marginBottom: '8px' }}>Avatar</div>
          {[['Gênero', avatar.genero], ['Idade', avatar.idade_aparente], ['Roupa', avatar.roupa], ['Ambiente', avatar.ambiente], ['Energia', avatar.energia]].map(([k, v]) => v && (
            <div key={k} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v}
            </div>
          ))}
        </div>
        <div className="tc-card">
          <div className="tc-section-title" style={{ marginBottom: '8px' }}>Edição</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}><span style={{ color: 'var(--text-muted)' }}>Formato:</span> {video_format}</div>
          {[['Legendas', editing.legendas], ['Trilha', editing.trilha], ['Ritmo', editing.ritmo], ['Headline', editing.headline]].map(([k, v]) => v && (
            <div key={k} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v}
            </div>
          ))}
        </div>
      </div>
      {/* ── 1. HOOK ESCRITO (primeiro lugar) ── */}
      <div>
        <div className="tc-section-title">Hook</div>
        <div className="tc-hook-box" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{hook_written}</div>
      </div>

      {/* ── 2. BODY (com parágrafos quebrados) ── */}
      <div>
        <div className="tc-section-title">Body</div>
        <div className="tc-result-box" style={{
          whiteSpace: 'pre-wrap',
          lineHeight: 1.75,
          fontSize: '13px',
          padding: '16px 18px',
        }}>{body}</div>
      </div>

      {/* ── 4. INFO VISUAL (recolhido — informação secundária) ── */}
      {(hook_visual && hook_visual !== '(análise visual não disponível para conteúdo 18+)') && (
        <details style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
          <summary style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
            Hook Visual + Detalhes técnicos
          </summary>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div><div className="tc-section-title">Hook Visual</div><div className="tc-result-box">{hook_visual}</div></div>
          </div>
        </details>
      )}
      {result.reverse_engineering && (
        <div style={{ border: '1px solid var(--border-default)', borderLeft: '3px solid #8b5cf6', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid var(--border-default)' }}>
            <FlaskConical size={13} style={{ color: '#8b5cf6' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8b5cf6' }}>Engenharia Reversa</span>
          </div>
          <div style={{ padding: '16px 20px', background: 'var(--bg-surface)' }}>
            <Markdown>{result.reverse_engineering}</Markdown>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => setShowSwipe((v) => !v)} className="tc-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Layers size={13} /> Salvar no Swipe
        </button>
        {result.reverse_engineering && (
          <button
            onClick={async () => {
              if (!projectId) return toast.error('Selecione um projeto ativo na sidebar primeiro')
              try {
                await api.post(`/intelligence/${projectId}/save-analysis`, {
                  type: 'ad_analysis',
                  title: title || 'Anúncio',
                  content: result.reverse_engineering,
                  metadata: { hook: hook_written, niche: niche || null },
                })
                toast.success('Análise salva na Inteligência do projeto!')
              } catch (err) {
                toast.error(err.response?.data?.detail || 'Erro ao salvar')
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', background: '#8b5cf6', border: '1px solid #8b5cf6', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            <Brain size={12} /> Salvar na Inteligência
          </button>
        )}
        <button onClick={() => saveHookToSwipe(result, niche)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', background: 'transparent', border: '1px solid #06b6d4', color: '#06b6d4', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Bookmark size={12} /> Salvar hook no Swipe
        </button>
      </div>
      {showSwipe && <SaveSwipePanel result={result} niche={niche} projectId={projectId} videoFile={videoFile} onClose={() => setShowSwipe(false)} />}
    </div>
  )
}

// ─── BatchJobRow ─────────────────────────────────────────────────────────────

const BatchJobRow = memo(function BatchJobRow({ item, niche, projectId, onDone, videoFile }) {
  const [expanded, setExpanded] = useState(false)
  const { status, result, error } = useTranscriptionJob('/ads', item.jobId)

  const isDone = status === 'done'
  const isError = status === 'error'
  const isRunning = !isDone && !isError

  // Notifica o pai exatamente UMA vez quando concluir (sem loop infinito)
  const notifiedRef = useRef(false)
  useEffect(() => {
    if (isDone && result && !notifiedRef.current) {
      notifiedRef.current = true
      onDone?.(item.jobId, result)
    }
  }, [isDone, result, item.jobId, onDone])

  const adName = (result?.title || item.filename).replace(/[^a-zA-Z0-9À-ú _-]/g, '')

  return (
    <div style={{
      border: '1px solid var(--border-default)',
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '8px',
      background: 'var(--bg-surface)',
    }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px',
          cursor: isDone ? 'pointer' : 'default',
          background: isDone ? 'var(--bg-surface)' : 'var(--bg-elevated)',
        }}
        onClick={() => isDone && setExpanded((v) => !v)}
      >
        {/* Status icon */}
        <div style={{ flexShrink: 0 }}>
          {isDone && <CheckCircle2 size={16} style={{ color: '#22c55e' }} />}
          {isError && <AlertCircle size={16} style={{ color: 'var(--accent)' }} />}
          {isRunning && <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />}
        </div>

        {/* Filename + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.filename}
          </div>
          {isRunning && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {STATUS_LABELS[status] || status}
            </div>
          )}
          {isError && (
            <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '2px' }}>
              {error}
            </div>
          )}
          {isDone && result?.title && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {result.title}
            </div>
          )}
        </div>

        {/* Download + expand — stop propagation so click doesn't toggle expand */}
        {isDone && result && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <DownloadMenu filename={adName} content={buildAdTxt(result)} label="Baixar" />
          </div>
        )}
        {isDone && (
          <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </div>

      {/* Expanded result */}
      {isDone && expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-default)' }}>
          <AdResult result={result} niche={niche} projectId={projectId} videoFile={videoFile} />
        </div>
      )}
    </div>
  )
})

// ─── Upload (1+ arquivos) ────────────────────────────────────────────────────

function BatchMode({ niche, reverseEngineer, adult, translate, activeProject }) {
  const fileInputRef = useRef(null)
  // Persiste a fila + resultados pra sobreviver à troca de aba
  const [queue, setQueue] = usePersistedState('ads:queue', [])     // [{id, filename, jobId}]
  const [submitting, setSubmitting] = useState(false)
  const [doneResults, setDoneResults] = usePersistedState('ads:doneResults', {})
  // Mantém o File original em memória por jobId (pra subir o vídeo pro R2 ao salvar
  // no Swipe). Não persiste — se recarregar a página, salva só o texto.
  const filesByJobRef = useRef({})

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/'))
    if (!files.length) return toast.error('Apenas vídeos ou áudios')
    submitFiles(files)
  }, [niche, reverseEngineer, adult, activeProject]) // eslint-disable-line

  const handleDragOver = (e) => e.preventDefault()

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files)
    if (files.length) submitFiles(files)
    e.target.value = ''
  }

  const submitFiles = async (files) => {
    setSubmitting(true)
    const newItems = []
    for (const file of files) {
      try {
        const form = new FormData()
        form.append('file', file)
        if (activeProject?.id) form.append('project_id', activeProject.id)
        if (niche) form.append('niche', niche)
        if (reverseEngineer) form.append('reverse_engineer', 'true')
        if (adult) form.append('adult', 'true')
        if (translate) form.append('translate', 'true')
        const res = await api.post('/ads/analyze', form)
        filesByJobRef.current[res.data.job_id] = file   // guarda o arquivo pra salvar no Swipe
        newItems.push({ id: res.data.job_id, filename: file.name, jobId: res.data.job_id })
      } catch (err) {
        toast.error(`Erro ao enviar ${file.name}: ${err.response?.data?.detail || err.message}`)
      }
    }
    if (newItems.length) {
      setQueue((prev) => [...newItems, ...prev])
      toast.success(`${newItems.length} arquivo${newItems.length > 1 ? 's' : ''} na fila!`)
    }
    setSubmitting(false)
  }

  const handleJobDone = useCallback((jobId, result) => {
    setDoneResults((prev) => ({ ...prev, [jobId]: result }))
  }, [])

  const doneCount = Object.keys(doneResults).length

  return (
    <div>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--border-default)',
          borderRadius: '12px',
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'var(--bg-elevated)',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
      >
        <Upload size={28} style={{ color: adult ? '#ef4444' : 'var(--text-muted)', marginBottom: '10px' }} />
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {submitting ? 'Enviando...' : 'Arraste os arquivos ou clique para selecionar'}
        </div>
        <div style={{ fontSize: '12px', color: adult ? '#ef4444' : 'var(--text-muted)', marginTop: '6px', fontWeight: adult ? 600 : 400 }}>
          {adult ? '🔞 Modo 18+ ativo: vai usar transcrição de áudio' : 'Vídeos e áudios (múltiplos arquivos permitidos)'}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.m4a"
          multiple
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Fila: {queue.length} arquivo{queue.length > 1 ? 's' : ''}
              {doneCount > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '11px', color: '#22c55e', fontWeight: 400 }}>
                  ({doneCount} concluído{doneCount > 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Baixar todos */}
              {doneCount > 0 && (
                <DownloadMenu
                  filename={`anuncios_em_massa_${doneCount}`}
                  content={Object.values(doneResults).map(buildAdTxt).join('\n\n' + '='.repeat(60) + '\n\n')}
                  label={`Baixar todos (${doneCount})`}
                />
              )}
              <button
                onClick={() => {
                  setQueue([]); setDoneResults({})
                  clearPersistedKeys('ads:queue', 'ads:doneResults')
                }}
                style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={11} /> Limpar
              </button>
            </div>
          </div>
          {queue.map((item) => (
            <BatchJobRow
              key={item.id}
              item={item}
              niche={niche}
              projectId={activeProject?.id}
              onDone={handleJobDone}
              videoFile={filesByJobRef.current[item.jobId]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [niche, setNiche] = useState('')
  const [reverseEngineer, setReverseEngineer] = useState(false)
  const [adult, setAdult] = useState(false)
  const [translate, setTranslate] = useState(false)

  // Sincroniza nicho ao trocar de projeto ativo (sempre pega o do projeto)
  useEffect(() => {
    setNiche(activeProject?.nicho || '')
  }, [activeProject?.id, activeProject?.nicho])

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Análise de <span style={{ color: 'var(--accent)' }}>Anúncios</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Envie vídeos de anúncios para análise completa.
        </p>
      </div>

      {/* Opções globais */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        <div>
          <label className="tc-label">
            Nicho (opcional)
            {activeProject?.nicho && (
              <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--accent)', fontWeight: 500 }}>
                · sincronizado com "{activeProject.name}"
              </span>
            )}
          </label>
          <div style={{ maxWidth: '280px' }}>
            <NicheSelect value={niche} onChange={setNiche} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {/* Toggle Engenharia Reversa */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setReverseEngineer((v) => !v)}
              style={{ width: '36px', height: '20px', borderRadius: '999px', background: reverseEngineer ? '#8b5cf6' : 'var(--border-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer' }}
            >
              <div style={{ position: 'absolute', top: '3px', left: reverseEngineer ? '18px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: '13px', color: reverseEngineer ? '#8b5cf6' : 'var(--text-secondary)', fontWeight: reverseEngineer ? 500 : 400, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <FlaskConical size={13} /> Engenharia Reversa
            </span>
          </label>

          {/* Toggle 18+ */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setAdult((v) => !v)}
              style={{ width: '36px', height: '20px', borderRadius: '999px', background: adult ? '#ef4444' : 'var(--border-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer' }}
            >
              <div style={{ position: 'absolute', top: '3px', left: adult ? '18px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: '13px', color: adult ? '#ef4444' : 'var(--text-secondary)', fontWeight: adult ? 500 : 400 }}>
              🔞 Anúncio 18+
            </span>
          </label>

          {/* Toggle Traduzir */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setTranslate((v) => !v)}
              style={{ width: '36px', height: '20px', borderRadius: '999px', background: translate ? '#10b981' : 'var(--border-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer' }}
            >
              <div style={{ position: 'absolute', top: '3px', left: translate ? '18px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: '13px', color: translate ? '#10b981' : 'var(--text-secondary)', fontWeight: translate ? 500 : 400, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Languages size={13} /> Traduzir para PT-BR
            </span>
          </label>
        </div>
        {adult && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Modo 18+ transcreve o áudio sem análise visual.
          </p>
        )}
      </div>

      <BatchMode niche={niche} reverseEngineer={reverseEngineer} adult={adult} translate={translate} activeProject={activeProject} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
