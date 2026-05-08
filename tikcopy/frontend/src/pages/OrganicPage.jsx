import { useState } from 'react'
import { Link2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { useTranscriptionJob, STATUS_LABELS } from '../hooks/useTranscriptionJob'

function ResultCard({ result }) {
  if (!result) return null
  const { title, hook, landing_phrase, body, transcript_full, metadata } = result
  return (
    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {title}
      </div>

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

      <div>
        <div className="tc-section-title">Hook</div>
        <div className="tc-hook-box">{hook}</div>
      </div>

      {landing_phrase && (
        <div>
          <div className="tc-section-title">Frase de Aterrissagem</div>
          <div className="tc-result-box">{landing_phrase}</div>
        </div>
      )}

      <div>
        <div className="tc-section-title">Corpo</div>
        <div className="tc-result-box">{body}</div>
      </div>

      <details>
        <summary style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
          Transcrição completa
        </summary>
        <div className="tc-result-box" style={{ marginTop: '8px', fontSize: '12px' }}>
          {transcript_full}
        </div>
      </details>
    </div>
  )
}

export default function OrganicPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [tab, setTab] = useState('url')
  const [url, setUrl] = useState('')
  const [niche, setNiche] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)

  const { jobId, setJobId, status, result, error, reset } = useTranscriptionJob('/transcribe')

  const handleUrlSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    reset()
    try {
      const res = await api.post('/transcribe/url', {
        url: url.trim(),
        project_id: activeProject?.id || null,
        niche: niche || null,
      })
      setJobId(res.data.job_id)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao iniciar transcrição')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    reset()
    try {
      const form = new FormData()
      form.append('file', file)
      if (activeProject?.id) form.append('project_id', activeProject.id)
      if (niche) form.append('niche', niche)
      const res = await api.post('/transcribe/upload', form)
      setJobId(res.data.job_id)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar arquivo')
    } finally {
      setLoading(false)
    }
  }

  const isProcessing = jobId && status && status !== 'done' && status !== 'error'

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Vídeos <span style={{ color: 'var(--accent)' }}>Orgânicos</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Transcreva e separe hook, frase de aterrissagem e corpo de qualquer vídeo.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
        {[{ key: 'url', label: 'Link', icon: Link2 }, { key: 'file', label: 'Upload', icon: Upload }].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '6px', fontSize: '12px',
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

      {/* Niche */}
      <div style={{ marginBottom: '14px' }}>
        <label className="tc-label">Nicho (opcional)</label>
        <input
          className="tc-input"
          placeholder="ex: finanças, saúde, fitness..."
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          style={{ maxWidth: '280px' }}
        />
      </div>

      {/* URL form */}
      {tab === 'url' && (
        <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '8px', maxWidth: '560px' }}>
          <input
            className="tc-input"
            placeholder="https://www.tiktok.com/@... ou youtube.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button className="tc-btn-primary" type="submit" disabled={loading || isProcessing} style={{ whiteSpace: 'nowrap' }}>
            {loading ? 'Enviando...' : 'Transcrever'}
          </button>
        </form>
      )}

      {/* File form */}
      {tab === 'file' && (
        <form onSubmit={handleFileSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', maxWidth: '560px' }}>
          <input
            type="file"
            accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.m4a,.mp3,.wav"
            onChange={(e) => setFile(e.target.files[0])}
            required
            style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}
          />
          <button className="tc-btn-primary" type="submit" disabled={loading || isProcessing || !file}>
            {loading ? 'Enviando...' : 'Transcrever'}
          </button>
        </form>
      )}

      {/* Status */}
      {isProcessing && (
        <div style={{
          marginTop: '20px', padding: '14px 16px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{
            width: '14px', height: '14px', border: '2px solid var(--accent)',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          {STATUS_LABELS[status] || status}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '20px', padding: '12px 16px',
          background: 'rgba(255,62,94,0.06)', border: '1px solid rgba(255,62,94,0.2)',
          borderRadius: '8px', fontSize: '13px', color: 'var(--accent)',
        }}>
          {error}
        </div>
      )}

      <ResultCard result={result} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
