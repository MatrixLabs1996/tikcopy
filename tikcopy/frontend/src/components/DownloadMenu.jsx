import { useState, useRef, useEffect } from 'react'
import { Download, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { downloadAs } from '../utils/download'

const FORMATS = [
  { id: 'txt', label: 'TXT', desc: 'Texto simples' },
  { id: 'pdf', label: 'PDF', desc: 'Documento PDF' },
  { id: 'docx', label: 'DOCX', desc: 'Word / Google Docs' },
]

/**
 * @param {string}   filename     — nome do arquivo sem extensão
 * @param {string}   [content]    — conteúdo já formatado como string (síncrono)
 * @param {function} [getContent] — () => Promise<string>: busca o conteúdo na hora do
 *                                  download (ex: carregar o draft completo do backend).
 *                                  Tem prioridade sobre `content`.
 * @param {string}   [label]      — label do botão (default: "Baixar")
 */
export default function DownloadMenu({ filename, content, getContent, label = 'Baixar' }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const ref = useRef(null)

  // Ao abrir, decide se o menu abre pra cima (quando não há espaço embaixo)
  const toggle = () => {
    setOpen((v) => {
      const next = !v
      if (next && ref.current) {
        const r = ref.current.getBoundingClientRect()
        setDropUp(window.innerHeight - r.bottom < 180)  // ~altura do menu de 3 itens
      }
      return next
    })
  }

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handle = async (fmt) => {
    setOpen(false)
    setLoading(true)
    try {
      const data = getContent ? await getContent() : content
      await downloadAs(fmt, filename, data)
    } catch (err) {
      toast.error(`Erro ao gerar ${fmt.toUpperCase()}: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Main button */}
      <button
        onClick={toggle}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '6px 11px', borderRadius: '6px', fontSize: '12px',
          background: 'transparent', border: '1px solid var(--border-default)',
          color: 'var(--text-secondary)', cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'var(--font)', transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
      >
        <Download size={12} />
        {loading ? 'Gerando...' : label}
        <ChevronDown size={10} style={{ marginLeft: '1px', opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, zIndex: 9999,
          ...(dropUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          minWidth: '150px', overflow: 'hidden',
        }}>
          {FORMATS.map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => handle(fmt.id)}
              style={{
                width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '9px 14px', background: 'transparent', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                borderBottom: fmt.id !== 'docx' ? '1px solid var(--border-subtle)' : 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt.label}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{fmt.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
