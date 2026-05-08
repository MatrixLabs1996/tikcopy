import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { useTranscriptionJob, STATUS_LABELS } from '../hooks/useTranscriptionJob'

export default function LessonsPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const { jobId, setJobId, status, result, error, reset } = useTranscriptionJob('/transcribe')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    reset()
    try {
      const form = new FormData()
      form.append('file', file)
      if (activeProject?.id) form.append('project_id', activeProject.id)
      const res = await api.post('/transcribe/lesson', form)
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
          Aulas <span style={{ color: 'var(--accent)' }}>&</span> Vídeos Longos
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Transcrição pura de aulas, podcasts e vídeos longos — sem separação de hook/corpo.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', maxWidth: '560px' }}>
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

      {result && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            {result.title}
          </div>
          <div className="tc-section-title">Transcrição Completa</div>
          <div className="tc-result-box">{result.transcript_full}</div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
