import { useState, useEffect } from 'react'
import { Link2, Upload, List, Files } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { useTranscriptionJob, STATUS_LABELS } from '../hooks/useTranscriptionJob'
import MemoryToggle from '../components/MemoryToggle'

// ── Salva resultado na memória do projeto ─────────────────────
async function saveToProjectMemory(projectId) {
  try {
    await api.post(`/copy-zone/${projectId}/index`)
    toast.success('Hook salvo na memória do projeto!')
  } catch {
    toast.error('Transcrição salva, mas falha ao indexar na memória.')
  }
}

// ── Resultado de uma transcrição ──────────────────────────────
function ResultCard({ result }) {
  if (!result) return null
  const { title, hook, landing_phrase, body, transcript_full, metadata } = result
  return (
    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {metadata && Object.keys(metadata).length > 0 && (
        <div className="tc-meta-grid">
          {[
            { label: 'Views', val: metadata.views },
            { label: 'Likes', val: metadata.likes },
            { label: 'Duração', val: metadata.duration },
            { label: 'Autor', val: metadata.author },
          ].filter(m => m.val && m.val !== '—').map(m => (
            <div key={m.label} className="tc-meta-item">
              <div className="tc-meta-val">{m.val}</div>
              <div className="tc-meta-label">{m.label}</div>
            </div>
          ))}
        </div>
      )}
      {hook && <div><div className="tc-section-title">Hook</div><div className="tc-hook-box">{hook}</div></div>}
      {landing_phrase && <div><div className="tc-section-title">Frase de Aterrissagem</div><div className="tc-result-box">{landing_phrase}</div></div>}
      {body && <div><div className="tc-section-title">Corpo</div><div className="tc-result-box">{body}</div></div>}
      {transcript_full && (
        <details>
          <summary style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>Transcrição completa</summary>
          <div className="tc-result-box" style={{ marginTop: '8px', fontSize: '12px' }}>{transcript_full}</div>
        </details>
      )}
    </div>
  )
}

function JobStatus({ status, error }) {
  if (!status || status === 'done') return null
  if (error || status === 'error') return (
    <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(255,62,94,0.06)', border: '1px solid rgba(255,62,94,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--accent)' }}>
      {error || 'Erro desconhecido'}
    </div>
  )
  return (
    <div style={{ marginTop: '14px', padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '13px', height: '13px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
      {STATUS_LABELS[status] || status}
    </div>
  )
}

// ── TAB: Link único ───────────────────────────────────────────
function TabLinkSingle({ niche, projectId, saveToMemory }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const { jobId, setJobId, status, result, error, reset } = useTranscriptionJob('/transcribe')
  const isProcessing = jobId && status && status !== 'done' && status !== 'error'

  useEffect(() => {
    if (status === 'done' && result && saveToMemory && projectId) {
      saveToProjectMemory(projectId)
    }
  }, [status, result])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    reset(); setLoading(true)
    try {
      const res = await api.post('/transcribe/url', { url: url.trim(), project_id: projectId, niche: niche || null })
      setJobId(res.data.job_id)
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao iniciar') }
    finally { setLoading(false) }
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', maxWidth: '560px' }}>
        <input className="tc-input" placeholder="https://www.tiktok.com/@..." value={url} onChange={e => setUrl(e.target.value)} required />
        <button className="tc-btn-primary" type="submit" disabled={loading || isProcessing} style={{ whiteSpace: 'nowrap' }}>
          {loading ? 'Enviando...' : 'Transcrever'}
        </button>
      </form>
      <JobStatus status={status} error={error} />
      <ResultCard result={result} />
    </>
  )
}

// ── TAB: Links em massa ───────────────────────────────────────
function TabLinkBatch({ niche, projectId, saveToMemory }) {
  const [urls, setUrls] = useState('')
  const [results, setResults] = useState([])
  const [progress, setProgress] = useState(null)
  const [running, setRunning] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const list = urls.split('\n').map(u => u.trim()).filter(Boolean)
    if (list.length === 0) return
    setResults([]); setRunning(true); setProgress({ current: 0, total: list.length })

    for (let i = 0; i < list.length; i++) {
      setProgress({ current: i + 1, total: list.length })
      try {
        const res = await api.post('/transcribe/url', { url: list[i], project_id: projectId, niche: niche || null })
        const jobId = res.data.job_id
        let done = false
        while (!done) {
          await new Promise(r => setTimeout(r, 2000))
          const poll = await api.get(`/transcribe/status/${jobId}`)
          if (poll.data.status === 'done') { setResults(prev => [...prev, poll.data.result]); done = true }
          else if (poll.data.status === 'error') { toast.error(`Erro no link ${i + 1}: ${poll.data.error}`); done = true }
        }
      } catch { toast.error(`Falha no link ${i + 1}`) }
    }

    setRunning(false); setProgress(null)
    if (saveToMemory && projectId) await saveToProjectMemory(projectId)
    else toast.success('Processamento em massa concluído!')
  }

  return (
    <>
      <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Cole um link por linha (TikTok, Instagram, YouTube)</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
        <textarea className="tc-input tc-textarea" placeholder={'https://www.tiktok.com/@...\nhttps://www.tiktok.com/@...'} value={urls} onChange={e => setUrls(e.target.value)} rows={6} required />
        <button className="tc-btn-primary" type="submit" disabled={running} style={{ alignSelf: 'flex-start' }}>
          {running ? `Processando ${progress?.current}/${progress?.total}...` : 'Transcrever todos'}
        </button>
      </form>
      {running && progress && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{progress.current} de {progress.total} concluídos</div>
          <div style={{ height: '4px', background: 'var(--border-default)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: '999px', width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>{results.length} vídeo{results.length !== 1 ? 's' : ''} processado{results.length !== 1 ? 's' : ''}</div>
          {results.map((r, i) => (
            <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: i > 0 ? '20px' : 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>#{i + 1}</div>
              <ResultCard result={r} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── TAB: Upload único ─────────────────────────────────────────
function TabUploadSingle({ niche, projectId, saveToMemory }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const { jobId, setJobId, status, result, error, reset } = useTranscriptionJob('/transcribe')
  const isProcessing = jobId && status && status !== 'done' && status !== 'error'

  useEffect(() => {
    if (status === 'done' && result && saveToMemory && projectId) {
      saveToProjectMemory(projectId)
    }
  }, [status, result])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    reset(); setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (projectId) form.append('project_id', projectId)
      if (niche) form.append('niche', niche)
      const res = await api.post('/transcribe/upload', form)
      setJobId(res.data.job_id)
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao enviar') }
    finally { setLoading(false) }
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center', maxWidth: '560px', flexWrap: 'wrap' }}>
        <input type="file" accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.m4a,.mp3,.wav" onChange={e => setFile(e.target.files[0])} required style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, minWidth: 0 }} />
        <button className="tc-btn-primary" type="submit" disabled={loading || isProcessing || !file}>
          {loading ? 'Enviando...' : 'Transcrever'}
        </button>
      </form>
      <JobStatus status={status} error={error} />
      <ResultCard result={result} />
    </>
  )
}

// ── TAB: Upload em massa ──────────────────────────────────────
function TabUploadBatch({ niche, projectId, saveToMemory }) {
  const [files, setFiles] = useState([])
  const [results, setResults] = useState([])
  const [progress, setProgress] = useState(null)
  const [running, setRunning] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (files.length === 0) return
    setResults([]); setRunning(true); setProgress({ current: 0, total: files.length })

    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length })
      try {
        const form = new FormData()
        form.append('file', files[i])
        if (projectId) form.append('project_id', projectId)
        if (niche) form.append('niche', niche)
        const res = await api.post('/transcribe/upload', form)
        const jobId = res.data.job_id
        let done = false
        while (!done) {
          await new Promise(r => setTimeout(r, 2000))
          const poll = await api.get(`/transcribe/status/${jobId}`)
          if (poll.data.status === 'done') { setResults(prev => [...prev, poll.data.result]); done = true }
          else if (poll.data.status === 'error') { toast.error(`Erro no arquivo ${i + 1}`); done = true }
        }
      } catch { toast.error(`Falha no arquivo ${i + 1}`) }
    }

    setRunning(false); setProgress(null)
    if (saveToMemory && projectId) await saveToProjectMemory(projectId)
    else toast.success('Processamento em massa concluído!')
  }

  return (
    <>
      <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Selecione vários arquivos de uma vez</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
        <input type="file" multiple accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.m4a,.mp3,.wav" onChange={e => setFiles(Array.from(e.target.files))} required style={{ fontSize: '12px', color: 'var(--text-secondary)' }} />
        {files.length > 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{files.length} arquivo{files.length !== 1 ? 's' : ''} selecionado{files.length !== 1 ? 's' : ''}</div>}
        <button className="tc-btn-primary" type="submit" disabled={running || files.length === 0} style={{ alignSelf: 'flex-start' }}>
          {running ? `Processando ${progress?.current}/${progress?.total}...` : 'Transcrever todos'}
        </button>
      </form>
      {running && progress && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{progress.current} de {progress.total} concluídos</div>
          <div style={{ height: '4px', background: 'var(--border-default)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: '999px', width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>{results.length} arquivo{results.length !== 1 ? 's' : ''} processado{results.length !== 1 ? 's' : ''}</div>
          {results.map((r, i) => (
            <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: i > 0 ? '20px' : 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>#{i + 1} — {r.title}</div>
              <ResultCard result={r} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────
const TABS = [
  { key: 'url-single',  label: 'Link único',     icon: Link2  },
  { key: 'url-batch',   label: 'Links em massa',  icon: List   },
  { key: 'file-single', label: 'Upload único',    icon: Upload },
  { key: 'file-batch',  label: 'Upload em massa', icon: Files  },
]

export default function OrganicPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [tab, setTab] = useState('url-single')
  const [niche, setNiche] = useState('')
  const [saveToMemory, setSaveToMemory] = useState(false)

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Vídeos <span style={{ color: 'var(--accent)' }}>Orgânicos</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Transcreva e separe hook, frase de aterrissagem e corpo de qualquer vídeo.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 13px', borderRadius: '6px', fontSize: '12px',
            fontFamily: 'var(--font)', cursor: 'pointer', border: 'none',
            background: tab === key ? 'var(--bg-active)' : 'transparent',
            color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: tab === key ? 500 : 400,
          }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Nicho + toggle de memória */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '20px' }}>
        <div>
          <label className="tc-label">Nicho (opcional)</label>
          <input className="tc-input" placeholder="ex: finanças, saúde, fitness..." value={niche} onChange={e => setNiche(e.target.value)} style={{ maxWidth: '220px' }} />
        </div>
        <MemoryToggle
          checked={saveToMemory}
          onChange={setSaveToMemory}
          projectName={activeProject?.name}
          disabled={!activeProject}
        />
      </div>

      {tab === 'url-single'  && <TabLinkSingle   niche={niche} projectId={activeProject?.id} saveToMemory={saveToMemory} />}
      {tab === 'url-batch'   && <TabLinkBatch    niche={niche} projectId={activeProject?.id} saveToMemory={saveToMemory} />}
      {tab === 'file-single' && <TabUploadSingle niche={niche} projectId={activeProject?.id} saveToMemory={saveToMemory} />}
      {tab === 'file-batch'  && <TabUploadBatch  niche={niche} projectId={activeProject?.id} saveToMemory={saveToMemory} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
