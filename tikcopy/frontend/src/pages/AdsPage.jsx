import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { useTranscriptionJob, STATUS_LABELS } from '../hooks/useTranscriptionJob'

function AdResult({ result }) {
  if (!result) return null
  const { title, duration, avatar = {}, video_format, editing = {}, hook_visual, hook_written, landing_phrase, body } = result
  return (
    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {title} · {duration}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div className="tc-card">
          <div className="tc-section-title" style={{ marginBottom: '8px' }}>Avatar</div>
          {[
            ['Gênero', avatar.genero],
            ['Idade', avatar.idade_aparente],
            ['Roupa', avatar.roupa],
            ['Ambiente', avatar.ambiente],
            ['Energia', avatar.energia],
          ].map(([k, v]) => v && (
            <div key={k} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v}
            </div>
          ))}
        </div>
        <div className="tc-card">
          <div className="tc-section-title" style={{ marginBottom: '8px' }}>Edição</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Formato:</span> {video_format}
          </div>
          {[
            ['Legendas', editing.legendas],
            ['Trilha', editing.trilha],
            ['Ritmo', editing.ritmo],
            ['Headline', editing.headline],
          ].map(([k, v]) => v && (
            <div key={k} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="tc-section-title">Hook Visual</div>
        <div className="tc-result-box">{hook_visual}</div>
      </div>
      <div>
        <div className="tc-section-title">Hook Escrito</div>
        <div className="tc-hook-box">{hook_written}</div>
      </div>
      {landing_phrase && (
        <div>
          <div className="tc-section-title">Frase de Aterrissagem</div>
          <div className="tc-result-box">{landing_phrase}</div>
        </div>
      )}
      <div>
        <div className="tc-section-title">Corpo (Transcrição Literal)</div>
        <div className="tc-result-box">{body}</div>
      </div>
    </div>
  )
}

export default function AdsPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [file, setFile] = useState(null)
  const [niche, setNiche] = useState('')
  const [loading, setLoading] = useState(false)
  const { jobId, setJobId, status, result, error, reset } = useTranscriptionJob('/ads')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    reset()
    try {
      const form = new FormData()
      form.append('file', file)
      if (activeProject?.id) form.append('project_id', activeProject.id)
      if (niche) form.append('niche', niche)
      const res = await api.post('/ads/analyze', form)
      setJobId(res.data.job_id)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar vídeo')
    } finally {
      setLoading(false)
    }
  }

  const isProcessing = jobId && status && status !== 'done' && status !== 'error'

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Análise de <span style={{ color: 'var(--accent)' }}>Anúncios</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Envie um vídeo de anúncio para análise completa com Gemini 2.5 Flash.
        </p>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label className="tc-label">Nicho (opcional)</label>
        <input
          className="tc-input"
          placeholder="ex: suplementos, cursos online..."
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          style={{ maxWidth: '280px' }}
        />
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', maxWidth: '560px' }}>
        <input
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
          onChange={(e) => setFile(e.target.files[0])}
          required
          style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}
        />
        <button className="tc-btn-primary" type="submit" disabled={loading || isProcessing || !file}>
          {loading ? 'Enviando...' : 'Analisar'}
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

      <AdResult result={result} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
