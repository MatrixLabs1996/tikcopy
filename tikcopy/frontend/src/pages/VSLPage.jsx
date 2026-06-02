import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { ChevronDown, ChevronRight, GitCompare, TvMinimalPlay, Brain, Upload, X, CheckCircle2, AlertCircle, Loader2, ChevronUp, Languages } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { useTranscriptionJob, STATUS_LABELS } from '../hooks/useTranscriptionJob'
import { buildVSLAnalysisTxt, buildVSLTranscriptTxt } from '../utils/download'
import DownloadMenu from '../components/DownloadMenu'
import Markdown from '../components/Markdown'
import ProgressBar, { VSL_STEPS, VSL_COMPARE_STEPS } from '../components/ProgressBar'
import NicheSelect from '../components/NicheSelect'
import usePersistedState, { clearPersistedKeys } from '../hooks/usePersistedState'

// ── RMBC block metadata ─────────────────────────────────────────
const RMBC_BLOCKS = [
  { key: 'bloco1', label: 'Bloco 1 — Identificação Geral', color: '#6366f1' },
  { key: 'bloco2', label: 'Bloco 2 — Big Idea', color: 'var(--accent)' },
  { key: 'bloco3', label: 'Bloco 3 — Lead (10 elementos)', color: 'var(--accent)' },
  { key: 'bloco4', label: 'Bloco 4 — Headline', color: 'var(--accent)' },
  { key: 'bloco5', label: 'Bloco 5 — Background Story', color: '#10b981' },
  { key: 'bloco6', label: 'Bloco 6 — Mecanismo', color: 'var(--accent)' },
  { key: 'bloco7', label: 'Bloco 7 — Apresentação do Produto', color: '#3b82f6' },
  { key: 'bloco8', label: 'Bloco 8 — Fechamento', color: '#f97316' },
  { key: 'bloco9', label: 'Bloco 9 — Pontos Fortes', color: 'var(--success-text)' },
  { key: 'bloco10', label: 'Bloco 10 — Pontos Fracos e Oportunidades', color: '#ef4444' },
  { key: 'bloco11', label: 'Bloco 11 — Extração de Swipes', color: '#a855f7' },
]

const COMPARE_SECTIONS = [
  { key: 'resumo_executivo', label: 'Resumo Executivo', color: '#6366f1' },
  { key: 'camada1', label: 'Camada 1 — Padrões Universais do Nicho', color: 'var(--accent)' },
  { key: 'camada2', label: 'Camada 2 — Padrões Regionais e Culturais', color: 'var(--accent)' },
  { key: 'camada3', label: 'Camada 3 — Diferenças de Abordagem', color: 'var(--accent)' },
  { key: 'camada4_vsl1', label: 'Camada 4 — Pitada Mágica VSL 1', color: '#10b981' },
  { key: 'camada4_vsl2', label: 'Camada 4 — Pitada Mágica VSL 2', color: 'var(--accent)' },
  { key: 'recomendacoes', label: 'Recomendações Estratégicas', color: '#f97316' },
]

// ── Collapsible block card ──────────────────────────────────────
function RMBCBlock({ label, color, content, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!content) return null
  return (
    <div style={{
      border: '1px solid var(--border-default)',
      borderLeft: `3px solid ${color}`,
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '8px',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px', background: 'var(--bg-elevated)',
          border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
          textAlign: 'left',
        }}
      >
        {open
          ? <ChevronDown size={13} style={{ color, flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color, flexShrink: 0 }} />}
        <span style={{ fontSize: '12px', fontWeight: 600, color, letterSpacing: '0.04em' }}>
          {label}
        </span>
      </button>
      {open && (
        <div style={{
          padding: '14px 18px',
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-default)',
        }}>
          <Markdown>{content}</Markdown>
        </div>
      )}
    </div>
  )
}

// ── Single VSL analysis result ──────────────────────────────────
function AnalysisResult({ result, projectId }) {
  if (!result) return null
  const { filename, transcript, analysis } = result

  const name = (analysis?.bloco1_titulo || filename || 'vsl').replace(/[^a-zA-Z0-9À-ú _-]/g, '')
  const [savingMemory, setSavingMemory] = useState(false)

  const handleSaveToMemory = async () => {
    if (!projectId) return toast.error('Selecione um projeto ativo na sidebar primeiro')
    setSavingMemory(true)
    try {
      await api.post(`/intelligence/${projectId}/save-analysis`, {
        type: 'vsl_analysis',
        title: analysis?.bloco1_titulo || filename || 'VSL',
        content: buildVSLAnalysisTxt(result),
        metadata: { filename, word_count: transcript?.split(' ').length || 0 },
      })
      toast.success('Análise salva na Inteligência do projeto!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSavingMemory(false)
    }
  }

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {analysis?.bloco1_titulo || filename}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {filename} · {transcript?.split(' ').length?.toLocaleString()} palavras transcritas
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
          <button
            onClick={handleSaveToMemory}
            disabled={savingMemory}
            title={projectId ? 'Salvar análise na memória do projeto' : 'Selecione um projeto primeiro'}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '6px', fontSize: '12px', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', cursor: savingMemory ? 'wait' : 'pointer', fontFamily: 'var(--font)', opacity: projectId ? 1 : 0.5 }}
          >
            <Brain size={12} /> {savingMemory ? 'Salvando...' : 'Salvar na Inteligência'}
          </button>
          <DownloadMenu
            filename={`${name} — transcrição`}
            content={buildVSLTranscriptTxt(result)}
            label="Transcrição"
          />
          <DownloadMenu
            filename={`${name} — análise RMBC`}
            content={buildVSLAnalysisTxt(result)}
            label="Análise RMBC"
          />
        </div>
      </div>

      {RMBC_BLOCKS.map((b, i) => (
        <RMBCBlock
          key={b.key}
          label={b.label}
          color={b.color}
          content={analysis?.[b.key]}
          defaultOpen={i === 0}
        />
      ))}

      {transcript && (
        <details style={{ marginTop: '16px' }}>
          <summary style={{
            fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer',
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500,
          }}>
            Transcrição completa
          </summary>
          <div style={{
            marginTop: '8px', padding: '14px',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '8px', fontSize: '13px', lineHeight: '1.75',
            color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: '400px',
            overflowY: 'auto',
          }}>
            {transcript}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Comparison result ───────────────────────────────────────────
function CompareResult({ result }) {
  if (!result) return null
  const { vsl1, vsl2, comparison } = result
  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px',
      }}>
        {[{ v: vsl1, color: '#10b981' }, { v: vsl2, color: 'var(--accent)' }].map(({ v, color }) => (
          <div key={v.name} className="tc-card" style={{ borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: '11px', color, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
              {v.name}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {v.analysis?.bloco1_titulo || v.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {v.analysis?.bloco1?.slice(0, 120)}...
            </div>
          </div>
        ))}
      </div>

      {COMPARE_SECTIONS.map((s, i) => {
        const content = s.key === 'camada4_vsl1'
          ? (comparison?.[s.key] ? `[${vsl1.name}]\n\n${comparison[s.key]}` : null)
          : s.key === 'camada4_vsl2'
          ? (comparison?.[s.key] ? `[${vsl2.name}]\n\n${comparison[s.key]}` : null)
          : comparison?.[s.key]
        return (
          <RMBCBlock
            key={s.key}
            label={s.label}
            color={s.color}
            content={content}
            defaultOpen={i === 0}
          />
        )
      })}
    </div>
  )
}

// ── Spinner ─────────────────────────────────────────────────────
function Spinner({ status }) {
  return (
    <div style={{
      marginTop: '20px', padding: '14px 16px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)',
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <div style={{
        width: '14px', height: '14px', border: '2px solid var(--accent)',
        borderTopColor: 'transparent', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite', flexShrink: 0,
      }} />
      {STATUS_LABELS[status] || status}
    </div>
  )
}

// ── BatchVSLRow ────────────────────────────────────────────────
const BatchVSLRow = memo(function BatchVSLRow({ item, projectId, onDone }) {
  const [expanded, setExpanded] = useState(false)
  const { status, result, error } = useTranscriptionJob('/vsl', item.jobId)

  const isDone = status === 'done'
  const isError = status === 'error'
  const isRunning = !isDone && !isError

  const notifiedRef = useRef(false)
  useEffect(() => {
    if (isDone && result && !notifiedRef.current) {
      notifiedRef.current = true
      onDone?.(item.jobId, result)
    }
  }, [isDone, result, item.jobId, onDone])

  const vslName = (result?.analysis?.bloco1_titulo || item.filename).replace(/[^a-zA-Z0-9À-ú _-]/g, '')

  return (
    <div style={{
      border: '1px solid var(--border-default)',
      borderRadius: '10px', overflow: 'hidden',
      marginBottom: '8px', background: 'var(--bg-surface)',
    }}>
      <div
        onClick={() => isDone && setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px', cursor: isDone ? 'pointer' : 'default',
          background: isDone ? 'var(--bg-surface)' : 'var(--bg-elevated)',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          {isDone && <CheckCircle2 size={16} style={{ color: 'var(--success-text)' }} />}
          {isError && <AlertCircle size={16} style={{ color: 'var(--accent)' }} />}
          {isRunning && <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.filename}
          </div>
          {isRunning && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{STATUS_LABELS[status] || status}</span>
              <span style={{ opacity: 0.6 }}>· passo {Math.max(1, VSL_STEPS.indexOf(status) + 1)}/{VSL_STEPS.length - 1}</span>
            </div>
          )}
          {isError && (
            <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '2px' }}>{error}</div>
          )}
          {isDone && result?.analysis?.bloco1_titulo && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {result.analysis.bloco1_titulo}
            </div>
          )}
        </div>
        {isDone && result && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <DownloadMenu
              filename={`${vslName} — análise RMBC`}
              content={buildVSLAnalysisTxt(result)}
              label="Análise"
            />
            <DownloadMenu
              filename={`${vslName} — transcrição`}
              content={buildVSLTranscriptTxt(result)}
              label="Transcrição"
            />
          </div>
        )}
        {isDone && (
          <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </div>

      {isDone && expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-default)' }}>
          <AnalysisResult result={result} projectId={projectId} />
        </div>
      )}
    </div>
  )
})

// ── BatchMode VSL ────────────────────────────────────────────────
function BatchMode({ activeProject, niche, translate }) {
  const fileInputRef = useRef(null)
  const [queue, setQueue] = usePersistedState('vsl:queue', [])
  const [submitting, setSubmitting] = useState(false)
  const [doneResults, setDoneResults] = usePersistedState('vsl:doneResults', {})

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/'))
    if (!files.length) return toast.error('Apenas vídeos ou áudios')
    submitFiles(files)
  }, [activeProject, niche]) // eslint-disable-line

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
        if (translate) form.append('translate', 'true')
        const res = await api.post('/vsl/analyze', form)
        newItems.push({ id: res.data.job_id, filename: file.name, jobId: res.data.job_id })
      } catch (err) {
        toast.error(`Erro ao enviar ${file.name}: ${err.response?.data?.detail || err.message}`)
      }
    }
    if (newItems.length) {
      setQueue((prev) => [...newItems, ...prev])
      toast.success(`${newItems.length} VSL${newItems.length > 1 ? 's' : ''} na fila!`)
    }
    setSubmitting(false)
  }

  const handleJobDone = useCallback((jobId, result) => {
    setDoneResults((prev) => ({ ...prev, [jobId]: result }))
  }, [])

  const doneCount = Object.keys(doneResults).length

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--border-default)',
          borderRadius: '12px', padding: '40px 24px',
          textAlign: 'center', cursor: 'pointer',
          background: 'var(--bg-elevated)', transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
      >
        <Upload size={28} style={{ color: 'var(--text-muted)', marginBottom: '10px' }} />
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {submitting ? 'Enviando...' : 'Arraste os arquivos ou clique para selecionar'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Vídeos e áudios de VSL — múltiplos arquivos permitidos
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.m4a,.wav"
          multiple
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {queue.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Fila — {queue.length} VSL{queue.length > 1 ? 's' : ''}
              {doneCount > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--success-text)', fontWeight: 400 }}>
                  ({doneCount} concluída{doneCount > 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {doneCount > 0 && (
                <DownloadMenu
                  filename={`vsls_em_massa_${doneCount}`}
                  content={Object.values(doneResults).map(buildVSLAnalysisTxt).join('\n\n' + '='.repeat(60) + '\n\n')}
                  label={`Baixar todas (${doneCount})`}
                />
              )}
              <button
                onClick={() => {
                  setQueue([]); setDoneResults({})
                  clearPersistedKeys('vsl:queue', 'vsl:doneResults')
                }}
                style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={11} /> Limpar
              </button>
            </div>
          </div>
          {queue.map((item) => (
            <BatchVSLRow
              key={item.id}
              item={item}
              projectId={activeProject?.id}
              onDone={handleJobDone}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AnalyzeTab() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [niche, setNiche] = useState('')
  const [translate, setTranslate] = useState(false)

  // Sincroniza nicho com o projeto ativo
  useEffect(() => {
    setNiche(activeProject?.nicho || '')
  }, [activeProject?.id, activeProject?.nicho])

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        Envie o arquivo de vídeo ou áudio da VSL. A transcrição é gerada e analisada nos 11 blocos do método RMBC.
      </p>

      {/* Nicho */}
      <div style={{ marginBottom: '14px' }}>
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

      {/* Toggles */}
      <div style={{ marginBottom: '18px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
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

      <BatchMode activeProject={activeProject} niche={niche} translate={translate} />
    </div>
  )
}

// ── TAB: Comparar ───────────────────────────────────────────────
function CompareTab() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [name1, setName1] = useState('')
  const [name2, setName2] = useState('')
  const [text1, setText1] = useState('')
  const [text2, setText2] = useState('')
  const [loading, setLoading] = useState(false)
  const { jobId, setJobId, status, result, error, reset } = useTranscriptionJob('/vsl')

  const isProcessing = jobId && status && status !== 'done' && status !== 'error'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text1.trim() || !text2.trim()) return
    setLoading(true)
    reset()
    try {
      const form = new FormData()
      form.append('transcript1', text1)
      form.append('transcript2', text2)
      form.append('name1', name1 || 'VSL 1')
      form.append('name2', name2 || 'VSL 2')
      if (activeProject?.id) form.append('project_id', activeProject.id)
      const res = await api.post('/vsl/compare', form)
      setJobId(res.data.job_id)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao comparar VSLs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
        Cole as transcrições de duas VSLs do mesmo nicho. Cada uma é analisada nos 11 blocos RMBC e depois comparadas nas 4 camadas — padrões universais, regionais, evolução e a pitada mágica de cada uma.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {[
            { label: 'VSL 1', name: name1, setName: setName1, text: text1, setText: setText1, color: '#10b981' },
            { label: 'VSL 2', name: name2, setName: setName2, text: text2, setText: setText2, color: 'var(--accent)' },
          ].map(({ label, name, setName, text, setText, color }) => (
            <div key={label} style={{
              border: `1px solid var(--border-default)`,
              borderTop: `3px solid ${color}`,
              borderRadius: '8px', padding: '14px',
              background: 'var(--bg-elevated)',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>
                {label}
              </div>
              <input
                className="tc-input"
                placeholder={`Nome / identificação (ex: VSL Suplemento BR)`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ marginBottom: '8px' }}
              />
              <textarea
                className="tc-input tc-textarea"
                placeholder={`Cole aqui a transcrição completa da ${label}...`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                required
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {text.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} palavras
              </div>
            </div>
          ))}
        </div>

        <button
          className="tc-btn-primary"
          type="submit"
          disabled={loading || isProcessing || !text1.trim() || !text2.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <GitCompare size={14} />
          {loading ? 'Enviando...' : 'Comparar VSLs'}
        </button>
      </form>

      {isProcessing && <ProgressBar currentStatus={status} steps={VSL_COMPARE_STEPS} />}

      {error && (
        <div style={{
          marginTop: '20px', padding: '12px 16px',
          background: 'rgba(255,62,94,0.06)', border: '1px solid rgba(255,62,94,0.2)',
          borderRadius: '8px', fontSize: '13px', color: 'var(--accent)',
        }}>
          {error}
        </div>
      )}

      <CompareResult result={result} />
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────
export default function VSLPage() {
  const [tab, setTab] = useState('analyze')

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Análise de <span style={{ color: 'var(--accent)' }}>VSL</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Transcrição + análise RMBC completa · Comparação de padrões entre VSLs
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0' }}>
        {[
          { id: 'analyze', label: 'Analisar VSL', icon: TvMinimalPlay },
          { id: 'compare', label: 'Comparar VSLs', icon: GitCompare },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', fontSize: '13px', fontWeight: tab === id ? 600 : 400,
              color: tab === id ? 'var(--text-primary)' : 'var(--text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px', transition: 'color 0.15s',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'analyze' ? <AnalyzeTab /> : <CompareTab />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
