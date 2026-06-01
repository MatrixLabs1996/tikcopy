import { useState, useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { Loader2, AlertCircle, Download } from 'lucide-react'
import api from '../services/api'

export default function BriefingViewerPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  // Detecta endpoint a partir da rota: /research-docs/:id/view → /research-docs
  const apiBase = pathname.startsWith('/research-docs') ? '/research-docs' : '/briefings'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [content, setContent] = useState(null)

  useEffect(() => {
    document.title = apiBase === '/research-docs' ? 'Pesquisa · CopyX' : 'Briefing · CopyX'
    let cancelled = false
    ;(async () => {
      try {
        const [urlRes, fileRes] = await Promise.all([
          api.get(`${apiBase}/${id}/file-url`),
          api.get(`${apiBase}/${id}/file`, { responseType: 'blob' }),
        ])
        if (cancelled) return
        const { url, file_name, content_type } = urlRes.data
        const blob = fileRes.data
        const ext = (file_name?.split('.').pop() || '').toLowerCase()
        document.title = file_name || 'Briefing'

        if (ext === 'pdf' || (content_type || '').includes('pdf')) {
          const blobUrl = URL.createObjectURL(blob)
          setContent({ kind: 'pdf', url: blobUrl, downloadUrl: url, fileName: file_name })
        } else if (ext === 'docx') {
          const arrayBuffer = await blob.arrayBuffer()
          const mammoth = await import('mammoth')
          const result = await mammoth.convertToHtml({ arrayBuffer })
          if (cancelled) return
          setContent({ kind: 'html', body: result.value, fileName: file_name, url })
        } else if (ext === 'doc') {
          setContent({ kind: 'download', url, fileName: file_name })
        } else {
          const text = await blob.text()
          if (cancelled) return
          setContent({ kind: 'text', body: text, fileName: file_name, url })
        }
      } catch (err) {
        if (cancelled) return
        console.error('[briefing viewer]', err)
        let detail = err.response?.data?.detail || err.message || 'Erro ao carregar'
        if (err.response?.data instanceof Blob) {
          try {
            const text = await err.response.data.text()
            try { detail = JSON.parse(text).detail || text } catch { detail = text }
          } catch {}
        }
        setError(detail)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#f9fafb',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '14px' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          Carregando documento…
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', background: '#f9fafb',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '32px',
          maxWidth: '420px', textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <AlertCircle size={36} color="#dc2626" style={{ marginBottom: '14px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>
            Não foi possível abrir o documento
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>{error}</div>
        </div>
      </div>
    )
  }

  if (content?.kind === 'pdf') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#525659' }}>
        <iframe
          src={content.url}
          title={content.fileName || 'PDF'}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    )
  }

  if (content?.kind === 'download') {
    return (
      <div style={{
        minHeight: '100vh', background: '#f9fafb',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '32px',
          maxWidth: '460px', textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>
            {content.fileName}
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
            Arquivos .doc antigos não renderizam direto no navegador. Baixe pra abrir no Word.
          </div>
          <a
            href={content.url}
            download={content.fileName}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: '8px',
              background: '#ff3e5e', color: '#fff', textDecoration: 'none',
              fontSize: '13px', fontWeight: 600,
            }}
          >
            <Download size={14} /> Baixar arquivo
          </a>
        </div>
      </div>
    )
  }

  const isHtml = content?.kind === 'html'

  return (
    <div style={{
      minHeight: '100vh', background: '#e5e7eb', padding: '40px 20px',
      fontFamily: '"Calibri","Segoe UI",Arial,sans-serif',
    }}>
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '20px', flexWrap: 'wrap', gap: '10px',
        }}>
          <div style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>
            {content?.fileName}
          </div>
          <a
            href={content?.url}
            download={content?.fileName}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '6px',
              background: '#fff', border: '1px solid #d1d5db',
              color: '#374151', textDecoration: 'none',
              fontSize: '12px', fontWeight: 500,
            }}
          >
            <Download size={12} /> Baixar original
          </a>
        </div>

        <div style={{
          background: '#fff', minHeight: '90vh',
          padding: '72px 96px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          borderRadius: '2px',
          fontSize: '11pt', lineHeight: 1.5, color: '#1f2937',
        }}>
          {isHtml
            ? <div className="docx-content" dangerouslySetInnerHTML={{ __html: content.body }} />
            : <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{content.body}</pre>
          }
        </div>

        <div style={{ height: '40px' }} />
      </div>

      <style>{`
        .docx-content h1 { font-size: 20pt; font-weight: 700; color: #2e74b5; margin: 24px 0 12px; line-height: 1.2; }
        .docx-content h2 { font-size: 16pt; font-weight: 700; color: #2e74b5; margin: 18px 0 8px; line-height: 1.2; }
        .docx-content h3 { font-size: 13pt; font-weight: 600; color: #1f4e79; margin: 14px 0 6px; }
        .docx-content h4, .docx-content h5, .docx-content h6 { font-weight: 600; color: #1f4e79; margin: 12px 0 4px; }
        .docx-content p { margin: 0 0 10pt; }
        .docx-content ul, .docx-content ol { margin: 0 0 10pt; padding-left: 28pt; }
        .docx-content li { margin-bottom: 4pt; }
        .docx-content strong { font-weight: 700; }
        .docx-content em { font-style: italic; }
        .docx-content a { color: #0563c1; text-decoration: underline; }
        .docx-content table { border-collapse: collapse; margin: 12pt 0; width: 100%; }
        .docx-content td, .docx-content th { border: 1px solid #bfbfbf; padding: 6pt 9pt; vertical-align: top; }
        .docx-content th { background: #f2f2f2; font-weight: 600; }
        .docx-content img { max-width: 100%; height: auto; margin: 8pt 0; }
        .docx-content hr { border: none; border-top: 1px solid #d1d5db; margin: 18pt 0; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
