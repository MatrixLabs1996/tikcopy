import { useState, useRef, useCallback } from 'react'
import { Upload, Languages, X, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import useJobsStore from '../stores/useJobsStore'
import MemoryToggle from '../components/MemoryToggle'
import Markdown from '../components/Markdown'
import DownloadMenu from '../components/DownloadMenu'

// ── Upload unificado (1+ arquivos) ───────────────────────────────
function UploadLessons({ projectId, saveToMemory, translate, studyGuide }) {
  const fileInputRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)

  const jobs = useJobsStore((s) => s.jobs)
  const addJobs = useJobsStore((s) => s.addJobs)
  const clearKind = useJobsStore((s) => s.clearKind)

  const lessonJobs = jobs.filter((j) => j.kind === 'lesson')
  const results = lessonJobs.filter((j) => j.status === 'done' && j.result)
  const activeCount = lessonJobs.filter((j) => j.status !== 'done' && j.status !== 'error' && j.status !== 'cancelled').length

  const submitFiles = async (files) => {
    if (!files.length) return
    setSubmitting(true)
    const newJobs = []
    for (const file of files) {
      try {
        const form = new FormData()
        form.append('file', file)
        if (projectId) form.append('project_id', projectId)
        if (translate) form.append('translate', 'true')
        if (studyGuide) form.append('study_guide', 'true')
        const res = await api.post('/transcribe/lesson', form)
        newJobs.push({
          id: res.data.job_id, kind: 'lesson', endpoint: '/transcribe',
          label: file.name, projectId, saveToMemory, translate,
        })
      } catch {
        toast.error(`Falha ao enviar: ${file.name}`)
      }
    }
    if (newJobs.length) {
      addJobs(newJobs)
      toast.success(`${newJobs.length} arquivo${newJobs.length > 1 ? 's' : ''} na fila — transcrevendo em background`)
    }
    setSubmitting(false)
  }

  const running = submitting
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/'))
    if (!files.length) return toast.error('Apenas vídeos ou áudios')
    submitFiles(files)
  }, [projectId, translate, saveToMemory, studyGuide]) // eslint-disable-line

  const handleDragOver = (e) => e.preventDefault()

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files)
    if (files.length) submitFiles(files)
    e.target.value = ''
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => !running && fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--border-default)',
          borderRadius: '12px',
          padding: '40px 24px',
          textAlign: 'center',
          cursor: running ? 'default' : 'pointer',
          background: 'var(--bg-elevated)',
          transition: 'border-color 0.15s',
          opacity: running ? 0.7 : 1,
        }}
        onMouseEnter={(e) => { if (!running) e.currentTarget.style.borderColor = 'var(--accent)' }}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
      >
        <Upload size={28} style={{ color: 'var(--text-muted)', marginBottom: '10px' }} />
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {running ? 'Enviando...' : 'Arraste os arquivos ou clique para selecionar'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Vídeos e áudios — múltiplos arquivos permitidos
          {activeCount > 0 && <> · <strong style={{ color: 'var(--accent)' }}>{activeCount} transcrevendo em background</strong></>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.m4a,.mp3,.wav"
          multiple
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {/* Resultados (vêm do store global — sobrevivem à troca de aba) */}
      {results.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {results.length} arquivo{results.length !== 1 ? 's' : ''} transcrito{results.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={() => clearKind('lesson')}
              style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <X size={11} /> Limpar
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {results.map((j, i) => (
              <div key={j.id} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: i > 0 ? '20px' : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    #{i + 1} — {j.result.title}
                  </div>
                  <DownloadMenu filename={j.result.title || 'guia-aula'} content={j.result.transcript_full || ''} label="Baixar guia" />
                </div>
                <div className="tc-result-box" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  <Markdown>{j.result.transcript_full || ''}</Markdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function LessonsPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [saveToMemory, setSaveToMemory] = useState(false)
  const [translate, setTranslate] = useState(false)
  const [studyGuide, setStudyGuide] = useState(false)

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Podcasts <span style={{ color: 'var(--accent)' }}>&</span> Aulas
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Transcreve aulas, podcasts e vídeos longos. Marque "material de estudo" pra organizar tudo num guia completo.
        </p>
      </div>

      {/* Toggles */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <MemoryToggle
          checked={saveToMemory}
          onChange={setSaveToMemory}
          projectName={activeProject?.name}
          disabled={!activeProject}
        />

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

        {/* Toggle Material de estudo */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
          <div
            onClick={() => setStudyGuide((v) => !v)}
            style={{ width: '36px', height: '20px', borderRadius: '999px', background: studyGuide ? 'var(--accent)' : 'var(--border-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer' }}
          >
            <div style={{ position: 'absolute', top: '3px', left: studyGuide ? '18px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: '13px', color: studyGuide ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: studyGuide ? 500 : 400, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <BookOpen size={13} /> Gerar material de estudo
          </span>
        </label>
      </div>

      {studyGuide && (
        <div style={{ marginBottom: '14px', fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px' }}>
          A IA vai organizar todo o conteúdo num guia completo e estruturado (índice, capítulos e subtópicos). Leva mais tempo e tem custo maior, mas o guia fica salvo na aba <strong>Conteúdo</strong>.
        </div>
      )}

      <UploadLessons projectId={activeProject?.id} saveToMemory={saveToMemory} translate={translate} studyGuide={studyGuide} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
