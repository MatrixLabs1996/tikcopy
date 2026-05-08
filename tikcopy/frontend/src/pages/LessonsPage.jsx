import { useState, useEffect } from 'react'
import { Upload, Files } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { useTranscriptionJob, STATUS_LABELS } from '../hooks/useTranscriptionJob'
import MemoryToggle from '../components/MemoryToggle'

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

// ── Upload único ──────────────────────────────────────────────
function TabUploadSingle({ projectId, saveToMemory, projectName }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const { jobId, setJobId, status, result, error, reset } = useTranscriptionJob('/transcribe')
  const isProcessing = jobId && status && status !== 'done' && status !== 'error'

  useEffect(() => {
    if (status === 'done' && saveToMemory && projectId) {
      api.post(`/copy-zone/${projectId}/index`).catch(() => {})
    }
  }, [status, saveToMemory, projectId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    reset(); setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (projectId) form.append('project_id', projectId)
      const res = await api.post('/transcribe/lesson', form)
      setJobId(res.data.job_id)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar arquivo')
    } finally { setLoading(false) }
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center', maxWidth: '560px', flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.m4a,.mp3,.wav"
          onChange={(e) => setFile(e.target.files[0])}
          required
          style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}
        />
        <button className="tc-btn-primary" type="submit" disabled={loading || isProcessing || !file}>
          {loading ? 'Enviando...' : 'Transcrever'}
        </button>
      </form>

      <JobStatus status={status} error={error} />

      {result && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>{result.title}</div>
          <div className="tc-section-title">Transcrição Completa</div>
          <div className="tc-result-box">{result.transcript_full}</div>
        </div>
      )}
    </>
  )
}

// ── Upload em massa ───────────────────────────────────────────
function TabUploadBatch({ projectId, saveToMemory, projectName }) {
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
        const res = await api.post('/transcribe/lesson', form)
        const jobId = res.data.job_id

        let done = false
        while (!done) {
          await new Promise(r => setTimeout(r, 2000))
          const poll = await api.get(`/transcribe/status/${jobId}`)
          if (poll.data.status === 'done') {
            setResults(prev => [...prev, poll.data.result])
            done = true
          } else if (poll.data.status === 'error') {
            toast.error(`Erro no arquivo ${i + 1}: ${poll.data.error}`)
            done = true
          }
        }
      } catch {
        toast.error(`Falha no arquivo ${i + 1}`)
      }
    }

    setRunning(false)
    setProgress(null)
    toast.success('Processamento em massa concluído!')

    if (saveToMemory && projectId) {
      api.post(`/copy-zone/${projectId}/index`).catch(() => {})
    }
  }

  return (
    <>
      <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Selecione vários arquivos de uma vez — cada um vira uma transcrição separada
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
        <input
          type="file"
          multiple
          accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.m4a,.mp3,.wav"
          onChange={(e) => setFiles(Array.from(e.target.files))}
          required
          style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
        />
        {files.length > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {files.length} arquivo{files.length !== 1 ? 's' : ''} selecionado{files.length !== 1 ? 's' : ''}
          </div>
        )}
        <button className="tc-btn-primary" type="submit" disabled={running || files.length === 0} style={{ alignSelf: 'flex-start' }}>
          {running ? `Transcrevendo ${progress?.current}/${progress?.total}...` : 'Transcrever todos'}
        </button>
      </form>

      {running && progress && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            {progress.current} de {progress.total} concluídos
          </div>
          <div style={{ height: '4px', background: 'var(--border-default)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--accent)', borderRadius: '999px',
              width: `${(progress.current / progress.total) * 100}%`,
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
            {results.length} arquivo{results.length !== 1 ? 's' : ''} transcrito{results.length !== 1 ? 's' : ''}
          </div>
          {results.map((r, i) => (
            <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: i > 0 ? '20px' : 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '8px' }}>
                #{i + 1} — {r.title}
              </div>
              <div className="tc-section-title">Transcrição</div>
              <div className="tc-result-box">{r.transcript_full}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────
const TABS = [
  { key: 'single', label: 'Upload único',    icon: Upload },
  { key: 'batch',  label: 'Upload em massa', icon: Files  },
]

export default function LessonsPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [tab, setTab] = useState('single')
  const [saveToMemory, setSaveToMemory] = useState(false)

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Podcasts <span style={{ color: 'var(--accent)' }}>&</span> Aulas
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Transcrição pura de aulas, podcasts e vídeos longos — sem separação de hook/corpo.
        </p>
      </div>

      {/* Memory toggle */}
      <div style={{ marginBottom: '16px' }}>
        <MemoryToggle
          checked={saveToMemory}
          onChange={setSaveToMemory}
          projectName={activeProject?.name}
          disabled={!activeProject}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', marginBottom: '20px' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 13px', borderRadius: '6px', fontSize: '12px',
              fontFamily: 'var(--font)', cursor: 'pointer', border: 'none',
              background: tab === key ? 'var(--bg-active)' : 'transparent',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: tab === key ? 500 : 400,
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === 'single' && <TabUploadSingle projectId={activeProject?.id} saveToMemory={saveToMemory} projectName={activeProject?.name} />}
      {tab === 'batch'  && <TabUploadBatch  projectId={activeProject?.id} saveToMemory={saveToMemory} projectName={activeProject?.name} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
