import { useState, useEffect, useRef, useMemo, memo, useCallback, forwardRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VirtuosoGrid } from 'react-virtuoso'
import { confirmAction } from '../stores/useConfirmStore'
import useTaxonomyStore, { useAllNiches, useAllFormats } from '../stores/useTaxonomyStore'
import { Trash2, Copy, Bookmark, Megaphone, User, Plus, Search, X, Edit2, Check, BookOpen, FolderOpen, Upload, Video, Play, HardDrive, FileVideo, PenLine, ExternalLink, Eye, Heart, Calendar, Tag, Clock, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import DownloadMenu from '../components/DownloadMenu'

// Monta o TXT de um anúncio do swipe pra download (hook visual, hook, body, avatar, edição)
function buildAdSwipeTxt(c) {
  const L = []
  L.push(`── ANÚNCIO — ${c.title || 'Sem título'}`)
  L.push('='.repeat(60)); L.push('')
  if (c.niche)  { L.push(`Nicho: ${c.niche}`) }
  if (c.format) { L.push(`Formato: ${c.format}`) }
  if (c.duration) { L.push(`Duração: ${c.duration}`) }
  L.push('')
  if (c.hook_visual)  { L.push('── HOOK VISUAL'); L.push('-'.repeat(40)); L.push(c.hook_visual); L.push('') }
  if (c.hook_written || c.hook) { L.push('── HOOK'); L.push('-'.repeat(40)); L.push(c.hook_written || c.hook); L.push('') }
  if (c.body) { L.push('── BODY'); L.push('-'.repeat(40)); L.push(c.body); L.push('') }
  if (c.avatar && Object.values(c.avatar).some(Boolean)) {
    L.push('── AVATAR'); L.push('-'.repeat(40))
    Object.entries(c.avatar).filter(([, v]) => v).forEach(([k, v]) => L.push(`${k.replace(/_/g, ' ')}: ${v}`))
    L.push('')
  }
  if (c.editing && Object.values(c.editing).some(Boolean)) {
    L.push('── EDIÇÃO'); L.push('-'.repeat(40))
    Object.entries(c.editing).filter(([, v]) => v).forEach(([k, v]) => L.push(`${k.replace(/_/g, ' ')}: ${v}`))
    L.push('')
  }
  if (c.observations) { L.push('── OBSERVAÇÕES'); L.push('-'.repeat(40)); L.push(c.observations) }
  return L.join('\n')
}

const TABS = [
  { key: 'hook',     label: 'Hooks',     icon: Bookmark  },
  { key: 'ad',       label: 'Anúncios',  icon: Megaphone },
  { key: 'organico', label: 'Orgânicos', icon: FileVideo },
  { key: 'avatar',   label: 'Avatares',  icon: User      },
]

// ── Nichos pré-definidos (user pode adicionar customizados) ──
export const NICHOS_PRESET = [
  'Disfunção Erétil', 'Emagrecimento', 'Diabetes', 'Finanças', 'Relacionamento',
  'Rejuvenescimento', 'Alzheimer', 'Próstata', 'Ejaculação Precoce',
  'Dor na Articulação / Juntas', 'Concurso / Carreira', 'Constipação', 'Visão',
  'Celulites', 'Intestino', 'Refluxo', 'Pressão Alta', 'Renda Extra',
  'Desenvolvimento P.', 'Produto Físico', 'Zumbido', 'Problemas dentários',
  'Fungos', 'Problemas respiratórios', 'Menopausa', 'Neuropatia',
]

// ── Formatos de anúncio pré-definidos ──
export const FORMATOS_PRESET = [
  'Podcast', 'Caixinha de Pergunta', 'Cinematográfico', 'Receita Estranha',
  'Normal / Frente a Cam', 'UGC', 'Draw My Life', 'Wikihow Animado',
  'Receitinha / UGC', 'Antes e depois', 'VÍDEO IA', 'IA BLACK', 'Estranho',
  'Depoimento', 'Normal e Cinematrográfico', 'React', 'Hack do corpo',
  'Tela dividida', 'Tiktok', 'Demonstrativo', 'Estático', 'Cortes',
  'Tela Branca', 'Formato Sexy', 'Formato Crazy', 'Imagem', 'Cinético',
  'Receitinha / Avatar da Oferta', 'Frutas / Cinético', 'Programa de Tv / UGC',
  'Click Bait / UGC', 'Video de Fundo / UGC', 'POV / Cinetico', 'React / UGC',
  'POV / Receitinha', 'Especialista', 'Super Estrutura / Cinético',
  'Reportagem / UGC', 'POV / UGC', 'POV / Cinematográfico', 'UGC / Cinético',
  'Deep Fake', 'Deep Fake + Cinético', 'Receita / Cinético', 'Formato Vturb',
]

// ─── Utils ─────────────────────────────────────────────────────────────────

function parseContent(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw }
  catch { return { raw } }
}

// Anúncio subido com vídeo mas SEM nenhum texto = transcrição pendente
function adNeedsTranscription(c) {
  const hasVideo = !!(c.video || c.has_video)
  const hasText = !!((c.body || '').trim() || (c.hook_written || '').trim()
    || (c.transcript_full || '').trim() || (c.hook || '').trim())
  return hasVideo && !hasText
}

function stringify(obj) {
  return JSON.stringify(obj)
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copiado!'))
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Converte métrica formatada ("11.5K", "1.7M", "701.1K", "1.2B") em número.
function parseMetricNum(val) {
  if (val == null) return 0
  if (typeof val === 'number') return val
  const s = String(val).trim().replace(/,/g, '.').replace(/\s/g, '')
  const m = s.match(/^([\d.]+)\s*([KMB])?/i)
  if (!m) return 0
  let n = parseFloat(m[1])
  if (isNaN(n)) return 0
  const suffix = (m[2] || '').toUpperCase()
  if (suffix === 'K') n *= 1e3
  else if (suffix === 'M') n *= 1e6
  else if (suffix === 'B') n *= 1e9
  return n
}

// Converte data de publicação ("DD/MM/YYYY") em timestamp; 0 se inválida.
function parsePublished(val) {
  if (!val || val === '—') return 0
  const m = String(val).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime()
  const t = Date.parse(val)
  return isNaN(t) ? 0 : t
}

const btnStyle = {
  padding: '5px 7px', borderRadius: '6px', background: 'transparent',
  border: '1px solid var(--border-default)', color: 'var(--text-muted)',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
}

// ─── VideoEmbed — embed TikTok/IG/YT a partir da URL ─────────────────────

function extractVideoId(url) {
  if (!url) return null
  // TikTok: /video/123456789
  const tiktokMatch = url.match(/tiktok\.com\/[^/]+\/video\/(\d+)/i)
  if (tiktokMatch) return { platform: 'tiktok', id: tiktokMatch[1] }
  // YouTube: /watch?v=ID  ou youtu.be/ID
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i)
  if (ytMatch) return { platform: 'youtube', id: ytMatch[1] }
  // Instagram: /reel/ID/ ou /p/ID/
  const igMatch = url.match(/instagram\.com\/(?:reel|p)\/([\w-]+)/i)
  if (igMatch) return { platform: 'instagram', id: igMatch[1] }
  return null
}

// memo: NUNCA re-renderiza se a URL não mudou. Crítico pra iframes — sem isso,
// um pause do TikTok podia reciclar o iframe quando o pai re-renderizasse,
// fazendo o vídeo "trocar/reiniciar".
const VideoEmbed = memo(function VideoEmbed({ url }) {
  const info = extractVideoId(url)
  // Sem URL ou plataforma não suportada → placeholder amigável
  if (!info) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.45)', gap: '4px', padding: '8px',
      }}>
        <User size={22} />
        <span style={{ fontSize: '9px', textAlign: 'center', lineHeight: 1.2 }}>
          {url ? 'Sem preview' : 'Sem link'}
        </span>
      </div>
    )
  }

  if (info.platform === 'tiktok') {
    // Player v3 + flags pra não mostrar "Vídeos relacionados" ao pausar.
    // - description=0   : esconde a barra de descrição/autor
    // - rel=0           : desliga sugestões de vídeos relacionados
    // - native_context_menu=0 : sem menu nativo
    // - closed_caption=0
    // - loop=1 (opcional): faz o vídeo loopar no fim ao invés de mostrar relacionados
    const src = `https://www.tiktok.com/player/v1/${info.id}?description=0&rel=0&native_context_menu=0&closed_caption=0&loop=0`
    return (
      <iframe
        src={src}
        allow="encrypted-media; autoplay; clipboard-write; picture-in-picture; web-share"
        allowFullScreen
        // Renderiza em tamanho NATIVO do TikTok (325x575) — o parent escala via CSS
        width="325"
        height="575"
        style={{ border: 'none', display: 'block', background: '#000', flexShrink: 0 }}
        title="TikTok video"
      />
    )
  }

  if (info.platform === 'youtube') {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${info.id}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' }}
        title="YouTube video"
      />
    )
  }

  if (info.platform === 'instagram') {
    return (
      <iframe
        src={`https://www.instagram.com/p/${info.id}/embed/`}
        allow="encrypted-media"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' }}
        title="Instagram post"
      />
    )
  }

  return null
})

// ─── VideoPlayer — carrega URL presigned sob demanda ──────────────────────

function VideoPlayer({ swipeId, hasVideo, autoLoad = false, maxHeight = 300 }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePlay = useCallback(async () => {
    if (url) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/videos/playback/${swipeId}`)
      setUrl(res.data.url)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao carregar vídeo')
    } finally {
      setLoading(false)
    }
  }, [url, swipeId])

  // Carrega o vídeo automaticamente (sem precisar clicar) quando autoLoad
  useEffect(() => {
    if (autoLoad && hasVideo && !url && !loading) handlePlay()
  }, [autoLoad, hasVideo]) // eslint-disable-line

  if (!hasVideo) return null

  if (url) {
    return (
      <video
        controls
        src={url}
        style={{ width: '100%', maxHeight: `${maxHeight}px`, borderRadius: '8px', background: '#000' }}
      />
    )
  }

  return (
    <button
      onClick={handlePlay}
      disabled={loading}
      style={{
        width: '100%', padding: '32px 16px', borderRadius: '8px',
        background: 'rgba(6,182,212,0.06)', border: '2px dashed rgba(6,182,212,0.3)',
        color: '#06b6d4', cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--font)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
      }}
    >
      {loading ? (
        <span style={{ fontSize: '12px' }}>Carregando...</span>
      ) : error ? (
        <span style={{ fontSize: '11px', color: 'var(--accent)' }}>{error}</span>
      ) : (
        <>
          <Play size={20} />
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Reproduzir vídeo</span>
        </>
      )}
    </button>
  )
}

// ─── VideoUploadBtn (genérico — usado em hooks/avatares se precisar) ──────

function VideoUploadBtn({ tab, onUploaded }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('tag', tab)
      form.append('title', file.name.replace(/\.[^.]+$/, ''))
      await api.post('/videos/upload-to-swipe', form)
      toast.success('Vídeo salvo no swipe!')
      onUploaded()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao subir vídeo')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '7px 12px', borderRadius: '6px', fontSize: '12px',
          background: '#06b6d4', border: '1px solid #06b6d4',
          color: '#fff', cursor: uploading ? 'wait' : 'pointer',
          fontFamily: 'var(--font)', fontWeight: 500,
          opacity: uploading ? 0.6 : 1,
        }}
      >
        <Video size={12} /> {uploading ? 'Subindo...' : 'Subir vídeo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </>
  )
}

// ─── SelectWithCreate ─────────────────────────────────────────────────────
// Select com opção "+ Criar novo" no final. Quando user escolhe, troca pra input livre.

function SelectWithCreate({ label, value, onChange, options: optionsProp, kind, placeholder = 'Selecione…' }) {
  const [creating, setCreating] = useState(false)
  const [custom, setCustom] = useState('')

  // kind='niche'|'format' → usa a lista global (presets + custom já usados).
  // Senão, usa as options passadas direto.
  const allNiches = useAllNiches()
  const allFormats = useAllFormats()
  const addNiche = useTaxonomyStore((s) => s.addNiche)
  const addFormat = useTaxonomyStore((s) => s.addFormat)
  const options = kind === 'niche' ? allNiches : kind === 'format' ? allFormats : (optionsProp || [])

  // Registra a tag custom no store global → aparece nos outros dropdowns na hora
  const commit = (v) => {
    const val = (v || '').trim()
    if (!val) return
    if (kind === 'niche') addNiche(val)
    if (kind === 'format') addFormat(val)
    onChange(val)
  }

  const isCustomValue = value && !options.includes(value)

  if (creating) {
    return (
      <div>
        {label && <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>{label}</label>}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            className="tc-input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Digite o novo nome…"
            style={{ flex: 1, fontSize: '13px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) {
                commit(custom.trim())
                setCreating(false)
              }
            }}
          />
          <button
            onClick={() => { if (custom.trim()) { commit(custom.trim()); setCreating(false) } }}
            style={{ padding: '6px 12px', borderRadius: '6px', background: '#8b5cf6', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px' }}
          >OK</button>
          <button
            onClick={() => { setCreating(false); setCustom('') }}
            style={{ ...btnStyle, padding: '6px 10px' }}
          ><X size={12} /></button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>{label}</label>}
      <select
        className="tc-input"
        value={isCustomValue ? '__custom__' : (value || '')}
        onChange={(e) => {
          if (e.target.value === '__new__') { setCreating(true); return }
          onChange(e.target.value || null)
        }}
        style={{ width: '100%', fontSize: '13px' }}
      >
        <option value="">{placeholder}</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        {isCustomValue && <option value="__custom__">★ {value} (custom)</option>}
        <option value="__new__">+ Criar novo…</option>
      </select>
    </div>
  )
}

// ─── UploadAdsModal — unifica "Subir vídeo" + "Importar" ──────────────────

function UploadAdsModal({ onClose, onSaved }) {
  const [niche, setNiche] = useState('')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const fileInputRef = useRef(null)

  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    setFiles((prev) => [...prev, ...picked])
    e.target.value = ''
  }
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const canUpload = files.length > 0 && niche && !uploading

  const handleUpload = async () => {
    if (!niche) return toast.error('Selecione um nicho')
    if (!files.length) return toast.error('Adicione pelo menos 1 vídeo')
    setUploading(true)
    setProgress({ done: 0, total: files.length })
    let ok = 0, fail = 0
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        const form = new FormData()
        form.append('file', f)
        form.append('tag', 'ad')
        form.append('title', f.name.replace(/\.[^.]+$/, ''))
        form.append('niche', niche)
        await api.post('/videos/upload-to-swipe', form)
        ok++
      } catch { fail++ }
      setProgress({ done: i + 1, total: files.length })
    }
    setUploading(false)
    if (ok) toast.success(`${ok} vídeo(s) salvo(s)!`)
    if (fail) toast.error(`${fail} falhou(aram)`)
    onSaved()
    if (ok) onClose()
  }

  const totalMb = files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '24px', maxWidth: '620px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>Subir anúncios</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Escolha o nicho — vale pra todos os vídeos deste lote
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <SelectWithCreate
            label="Nicho *"
            value={niche}
            onChange={setNiche}
            kind="niche"
            placeholder="Escolha o nicho…"
          />

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>
              Vídeos
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.webm,.mkv"
              multiple
              onChange={pickFiles}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: '100%', padding: '22px', borderRadius: '10px',
                border: '2px dashed var(--border-default)', background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)', cursor: uploading ? 'wait' : 'pointer',
                fontFamily: 'var(--font)', fontSize: '13px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              }}
            >
              <Upload size={20} />
              <span>Clique pra escolher vídeos do computador</span>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>1 ou vários — MP4, MOV, WebM, MKV</span>
            </button>

            {files.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>{files.length}</strong> vídeo(s)</span>
                  <span>{totalMb.toFixed(1)} MB</span>
                </div>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '6px',
                      background: 'var(--bg-elevated)', fontSize: '12px',
                    }}>
                      <Video size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ opacity: 0.6, fontSize: '11px' }}>{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                      {!uploading && (
                        <button onClick={() => removeFile(i)} style={{ ...btnStyle, padding: '2px 6px' }}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {uploading && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Subindo {progress.done}/{progress.total}…
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button onClick={onClose} disabled={uploading} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className="tc-btn-primary"
            style={{ opacity: canUpload ? 1 : 0.5 }}
          >
            {uploading ? `Subindo ${progress.done}/${progress.total}…` : `Subir ${files.length || ''} vídeo(s)`.trim()}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EditAdModal — edita nicho, formato e título de um ad existente ──────

function EditAdModal({ swipe, onClose, onSaved }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const [title, setTitle] = useState(c.title || '')
  const [niche, setNiche] = useState(c.niche || '')
  const [formato, setFormato] = useState(c.format || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = { ...c, title, niche, format: formato }
      await api.patch(`/swipes/${swipe.id}`, { content: stringify(updated) })
      toast.success('Atualizado!')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>Editar anúncio</div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>Título</label>
            <input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', fontSize: '13px' }} />
          </div>
          <SelectWithCreate label="Nicho" value={niche} onChange={setNiche} kind="niche" placeholder="Escolha…" />
          <SelectWithCreate label="Formato" value={formato} onChange={setFormato} kind="format" placeholder="Escolha…" />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="tc-btn-primary">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── StorageUsageBadge ────────────────────────────────────────────────────

function StorageUsageBadge({ refreshKey = 0 }) {
  const [usage, setUsage] = useState(null)
  const [enabled, setEnabled] = useState(true)
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    api.get('/videos/me/usage').then(res => setUsage(res.data)).catch(() => setEnabled(false))
  }, [refreshKey])

  const cleanup = async () => {
    setCleaning(true)
    try {
      const res = await api.post('/videos/me/cleanup-orphans')
      setUsage(res.data)
      toast.success(res.data.deleted > 0
        ? `${res.data.deleted} vídeo${res.data.deleted > 1 ? 's' : ''} órfão${res.data.deleted > 1 ? 's' : ''} removido${res.data.deleted > 1 ? 's' : ''}`
        : 'Nenhum lixo encontrado')
    } catch {
      toast.error('Erro ao limpar')
    } finally {
      setCleaning(false)
    }
  }

  if (!enabled || !usage) return null

  const formatted = usage.gb >= 1
    ? `${usage.gb.toFixed(2)} GB`
    : `${usage.mb.toFixed(1)} MB`

  return (
    <button
      onClick={cleanup}
      disabled={cleaning}
      title="Clique pra limpar vídeos órfãos (que sobraram de itens já apagados)"
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '5px 10px', borderRadius: '6px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        fontSize: '11px', color: 'var(--text-muted)', cursor: cleaning ? 'wait' : 'pointer',
        fontFamily: 'var(--font)',
      }}
    >
      {cleaning ? <Loader2 size={11} style={{ animation: 'spin 0.9s linear infinite' }} /> : <HardDrive size={11} />}
      <span>{cleaning ? 'Limpando…' : formatted}</span>
    </button>
  )
}

function Chip({ children, color = 'muted' }) {
  const palettes = {
    accent: { bg: 'rgba(255,62,94,0.08)', border: 'rgba(255,62,94,0.2)', text: 'var(--accent)' },
    muted:  { bg: 'var(--bg-active)',     border: 'var(--border-default)', text: 'var(--text-muted)' },
    purple: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)', text: '#8b5cf6' },
    green:  { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', text: '#22c55e' },
  }
  const p = palettes[color] || palettes.muted
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
      background: p.bg, border: `1px solid ${p.border}`, color: p.text,
    }}>{children}</span>
  )
}

// ─── Card de Hook ──────────────────────────────────────────────────────────

const SOURCE_META = {
  ad:      { label: 'Anúncio',  color: 'var(--text-secondary)' },
  organic: { label: 'Orgânico', color: 'var(--text-secondary)' },
  manual:  { label: 'Manual',   color: 'var(--text-secondary)' },
}

// Cor neutra do site pra todas as tags (sem visual "de IA")
const NEUTRAL = 'var(--text-secondary)'

const TYPE_META = {
  pergunta:     { label: 'Pergunta',     color: NEUTRAL },
  dor:          { label: 'Dor',          color: NEUTRAL },
  promessa:     { label: 'Promessa',     color: NEUTRAL },
  contrarian:   { label: 'Contrarian',   color: NEUTRAL },
  story:        { label: 'Story',        color: NEUTRAL },
  numero:       { label: 'Número',       color: NEUTRAL },
  autoridade:   { label: 'Autoridade',   color: NEUTRAL },
  prova_social: { label: 'Prova Social', color: NEUTRAL },
  urgencia:     { label: 'Urgência',     color: NEUTRAL },
  revelacao:    { label: 'Revelação',    color: NEUTRAL },
}

const EMOTION_META = {
  medo:           { label: 'Medo',           color: NEUTRAL },
  raiva:          { label: 'Raiva',          color: NEUTRAL },
  curiosidade:    { label: 'Curiosidade',    color: NEUTRAL },
  esperanca:      { label: 'Esperança',      color: NEUTRAL },
  urgencia:       { label: 'Urgência',       color: NEUTRAL },
  desejo:         { label: 'Desejo',         color: NEUTRAL },
  identificacao:  { label: 'Identificação',  color: NEUTRAL },
}

const STATUS_META = {
  validado:    { label: 'Validado',    color: NEUTRAL },
  viral:       { label: 'Viral',       color: NEUTRAL },
  em_teste:    { label: 'Em teste',    color: NEUTRAL },
  flop:        { label: 'Flop',        color: NEUTRAL },
  inspiracao:  { label: 'Inspiração',  color: NEUTRAL },
}

function customTypeColor(name) { return NEUTRAL }
function customTypeLabel(name) {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
function getTypeMeta(hookType) {
  if (!hookType) return null
  if (TYPE_META[hookType]) return TYPE_META[hookType]
  return { label: customTypeLabel(hookType), color: customTypeColor(hookType), isCustom: true }
}

const HookCard = memo(function HookCard({ swipe, onDelete, onEdit, onUseAsReference, onUseHookInCopy, onReclassify, onTagClick, onStatusChange, onOpenEdit }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const [reclassifying, setReclassifying] = useState(false)
  const hook = c.hook || c.raw || swipe.content
  const source = c.source || 'manual'
  const srcMeta = SOURCE_META[source] || SOURCE_META.manual
  const typeMeta = getTypeMeta(c.hook_type)
  const emoMeta = c.emotion ? EMOTION_META[c.emotion] : null
  const statMeta = STATUS_META[c.status || 'inspiracao']

  const handleReclassify = async () => {
    setReclassifying(true)
    try { await onReclassify(swipe.id) } finally { setReclassifying(false) }
  }

  const handleStatusChange = (newStatus) => {
    onStatusChange(swipe.id, { ...c, status: newStatus })
  }

  // Chip clicável (vira filtro)
  const ClickChip = ({ children, color, bg, onClick, title }) => (
    <button
      onClick={onClick}
      title={title || `Filtrar por: ${children}`}
      style={{
        fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
        background: bg || `${color}15`, border: `1px solid ${color}40`, color,
        cursor: 'pointer', fontFamily: 'var(--font)',
      }}
    >{children}</button>
  )

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {/* Origem */}
        <ClickChip color={srcMeta.color} onClick={() => onTagClick('source', source)}>{srcMeta.label}</ClickChip>

        {/* Tipo */}
        {typeMeta && (
          <ClickChip color={typeMeta.color} onClick={() => onTagClick('hook_type', c.hook_type)}>{typeMeta.label}</ClickChip>
        )}

        {/* Emoção */}
        {emoMeta && (
          <ClickChip color={emoMeta.color} onClick={() => onTagClick('emotion', c.emotion)}>{emoMeta.label}</ClickChip>
        )}

        {/* Nicho */}
        {c.niche && (
          <ClickChip color="#ff3e5e" onClick={() => onTagClick('niche', c.niche)}>{c.niche}</ClickChip>
        )}

        {/* Custom tags */}
        {(c.custom_tags || []).map(t => (
          <ClickChip key={t} color="#8b5cf6" onClick={() => onTagClick('custom_tag', t)}>{t}</ClickChip>
        ))}

        {/* Status (dropdown editável) */}
        <select
          value={c.status || 'inspiracao'}
          onChange={(e) => handleStatusChange(e.target.value)}
          title="Status do hook"
          style={{
            fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px',
            background: `${statMeta.color}15`, border: `1px solid ${statMeta.color}40`, color: statMeta.color,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          {Object.entries(STATUS_META).map(([key, m]) => (
            <option key={key} value={key}>{m.label}</option>
          ))}
        </select>
      </div>

      <div style={{
        fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)',
        borderLeft: '3px solid var(--accent)', paddingLeft: '12px',
        whiteSpace: 'pre-wrap',
      }}>
        {hook}
      </div>

      {/* Hooks orgânicos: mostra métricas do vídeo (views/likes/data) ao invés da legenda.
          Outros hooks: mostra o título/legenda como antes. */}
      {(() => {
        const m = c.metadata || {}
        const hasMetrics = m.views || m.likes || m.published
        if (source === 'organic' && hasMetrics) {
          return (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-muted)', alignItems: 'center' }}>
              {m.views && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Visualizações"><Eye size={11} /> {m.views}</span>}
              {m.likes && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Curtidas"><Heart size={11} /> {m.likes}</span>}
              {m.published && m.published !== '—' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Publicado em"><Calendar size={11} /> {m.published}</span>}
            </div>
          )
        }
        // Não-orgânico: legenda/título (se houver)
        if (source !== 'organic' && c.title) {
          return <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.title}</div>
        }
        return null
      })()}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Botão principal: usar hook em copy */}
        <button
          onClick={() => onUseHookInCopy(swipe)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '7px 10px', borderRadius: '6px', fontSize: '12px',
            background: 'var(--accent)', border: 'none', color: '#fff',
            cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
          }}
        >
          <PenLine size={12} /> Usar hook na copy
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDate(swipe.created_at)}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => onUseAsReference(swipe)} style={btnStyle} title="Usar como referência em Escrever"><BookOpen size={12} /></button>
            <button onClick={() => copyText(hook)} style={btnStyle} title="Copiar"><Copy size={12} /></button>
            <button onClick={() => onOpenEdit(swipe)} style={btnStyle} title="Editar"><Edit2 size={12} /></button>
            <button onClick={() => onDelete(swipe.id)} style={btnStyle} title="Remover"><Trash2 size={12} /></button>
          </div>
        </div>
      </div>
    </div>
  )
})

// ─── Card de Ad ────────────────────────────────────────────────────────────

const AdCard = memo(function AdCard({ swipe, onDelete, onEdit, onUseAsReference, onEditAd, onDetails, onTranscribe, isAnalyzing }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const [obs, setObs] = useState(c.observations || '')
  const [savedObs, setSavedObs] = useState(c.observations || '')
  const [savingObs, setSavingObs] = useState(false)
  const hasVideo = !!(c.video || c.has_video)
  const obsDirty = obs !== savedObs

  const [dlVideo, setDlVideo] = useState(false)

  const handleSaveObs = async () => {
    setSavingObs(true)
    try {
      const updated = { ...c, observations: obs }
      await onEdit(swipe.id, stringify(updated))
      setSavedObs(obs)
      toast.success('Observações salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSavingObs(false)
    }
  }

  // Baixa o arquivo de vídeo do R2 pro computador
  const handleDownloadVideo = async () => {
    setDlVideo(true)
    try {
      const res = await api.get(`/videos/playback/${swipe.id}`)
      const url = res.data.url
      const blob = await fetch(url).then(r => r.blob())
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `${(c.title || 'anuncio').replace(/[^a-zA-Z0-9À-ú _-]/g, '')}.mp4`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(objUrl)
    } catch {
      toast.error('Erro ao baixar o vídeo')
    } finally {
      setDlVideo(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {c.niche && <Chip color="accent">{c.niche}</Chip>}
          {c.format && <Chip>{c.format}</Chip>}
          {adNeedsTranscription(c) && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px',
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b',
            }}>
              <Clock size={11} /> Transcrição pendente
            </span>
          )}
          {(c.custom_tags || []).map(t => <Chip key={t} color="purple">{t}</Chip>)}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
          {hasVideo && (
            <button onClick={handleDownloadVideo} disabled={dlVideo} style={btnStyle} title="Baixar vídeo">
              {dlVideo ? <Loader2 size={12} style={{ animation: 'spin 0.9s linear infinite' }} /> : <FileVideo size={12} />}
            </button>
          )}
          <DownloadMenu filename={(c.title || 'anuncio').replace(/[^a-zA-Z0-9À-ú _-]/g, '')} content={buildAdSwipeTxt(c)} label="Baixar transcrição" />
          <button onClick={() => onUseAsReference(swipe)} style={btnStyle} title="Usar como referência"><BookOpen size={12} /></button>
          <button onClick={() => onEditAd(swipe)} style={btnStyle} title="Editar nicho/formato"><PenLine size={12} /></button>
          <button onClick={() => onDelete(swipe.id)} style={btnStyle} title="Remover"><Trash2 size={12} /></button>
        </div>
      </div>

      {/* Video Player (carrega automaticamente, sem precisar clicar) */}
      {hasVideo && <VideoPlayer swipeId={swipe.id} hasVideo autoLoad />}

      {/* Analisar — só quando o anúncio tem vídeo mas ainda não tem texto */}
      {adNeedsTranscription(c) && (
        <button
          onClick={() => !isAnalyzing && onTranscribe?.(swipe)}
          disabled={isAnalyzing}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '9px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)',
            color: '#f59e0b', cursor: isAnalyzing ? 'wait' : 'pointer', fontFamily: 'var(--font)',
            opacity: isAnalyzing ? 0.7 : 1,
          }}
          onMouseEnter={(e) => { if (!isAnalyzing) e.currentTarget.style.background = 'rgba(245,158,11,0.2)' }}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
        >
          {isAnalyzing
            ? <><Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> Analisando…</>
            : <><Clock size={13} /> Analisar vídeo</>}
        </button>
      )}

      {/* Ver detalhes — popup com todas as infos + vídeo ao lado */}
      <button
        onClick={() => onDetails?.(swipe)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          padding: '8px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
          background: 'transparent', border: '1px solid var(--border-default)',
          color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
      >
        <Eye size={13} /> Ver detalhes
      </button>

      {c.title && <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.title}</div>}

      {c.hook_written && (
        <div>
          <div className="tc-section-title" style={{ marginBottom: '6px' }}>Hook</div>
          <div style={{
            fontSize: '13px', lineHeight: '1.6', color: 'var(--text-primary)',
            borderLeft: '3px solid var(--accent)', paddingLeft: '12px',
            whiteSpace: 'pre-wrap',
          }}>
            {c.hook_written}
          </div>
        </div>
      )}

      {c.body && (
        <details>
          <summary style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
            Body completo
          </summary>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{c.body}</div>
        </details>
      )}

      {c.avatar && Object.values(c.avatar).some(Boolean) && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {c.avatar.genero && <span><b>Gênero:</b> {c.avatar.genero}</span>}
          {c.avatar.idade_aparente && <span><b>Idade:</b> {c.avatar.idade_aparente}</span>}
          {c.avatar.energia && <span><b>Energia:</b> {c.avatar.energia}</span>}
        </div>
      )}

      {swipe.source && (
        <a href={swipe.source} target="_blank" rel="noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none', wordBreak: 'break-all', fontSize: '11px' }}>
          {swipe.source}
        </a>
      )}

      <div>
        <div className="tc-section-title" style={{ marginBottom: '4px' }}>Observações</div>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="O que achou interessante neste anúncio..."
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
            borderRadius: '6px', padding: '8px 10px', fontSize: '12px',
            color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: '1.5',
            minHeight: '50px',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            onClick={handleSaveObs}
            disabled={!obsDirty || savingObs}
            style={{
              padding: '5px 14px', borderRadius: '6px', fontSize: '11px',
              background: obsDirty ? 'var(--accent)' : 'transparent',
              border: `1px solid ${obsDirty ? 'var(--accent)' : 'var(--border-default)'}`,
              color: obsDirty ? '#fff' : 'var(--text-muted)',
              cursor: obsDirty && !savingObs ? 'pointer' : 'default',
              fontFamily: 'var(--font)', fontWeight: 500,
              opacity: savingObs ? 0.6 : 1,
            }}
          >
            {savingObs ? 'Salvando…' : obsDirty ? 'OK' : 'Salvo'}
          </button>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDate(swipe.created_at)}</div>
    </div>
  )
})

// ─── TranscriptionViewerModal: popup com transcrição + preview ─────────────

function TranscriptionViewerModal({ swipe, onClose, onUseAsReference, onEdit }) {
  const navigate = useNavigate()
  const c = swipe._parsed || parseContent(swipe.content)
  const videoUrl = c.source_video_url || swipe.source || ''
  const title = c.title || 'Vídeo orgânico'
  const transcript = c.transcript_full || c.hook || c.body || '(sem transcrição salva)'

  // Formato editável aqui — você assiste o vídeo e escolhe o formato certo
  const [format, setFormat] = useState(c.format || '')
  const [savingFmt, setSavingFmt] = useState(false)
  const saveFormat = async (newFmt) => {
    setFormat(newFmt)
    setSavingFmt(true)
    try {
      await onEdit?.(swipe.id, stringify({ ...c, format: newFmt }))
    } catch {
      toast.error('Erro ao salvar formato')
    } finally {
      setSavingFmt(false)
    }
  }

  const copyLink = () => {
    if (!videoUrl) return toast.error('Sem link')
    copyText(videoUrl)
  }

  const handleUseAsReference = () => {
    // Coloca a copy do orgânico no sessionStorage e navega pra Escrever
    try {
      sessionStorage.setItem('swipe_reference', JSON.stringify(swipe))
      toast.success('Indo para Escrever com referência…')
      onClose()
      navigate('/criar-copy')
    } catch {
      toast.error('Erro ao usar como referência')
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', width: '100%', maxWidth: '960px', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              Transcrição do orgânico
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '5px 9px', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        {/* Body: transcrição (esquerda) + preview (direita) */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 280px', minHeight: 0 }}>
          {/* Transcrição */}
          <div style={{ overflowY: 'auto', padding: '18px 22px', borderRight: '1px solid var(--border-subtle)' }}>
            {c.niche || c.format ? (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {c.niche && <Chip color="accent">🎯 {c.niche}</Chip>}
                {c.format && <Chip>🎬 {c.format}</Chip>}
              </div>
            ) : null}
            {c.hook && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>Hook</div>
                <div style={{
                  fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6,
                  borderLeft: '3px solid var(--accent)', paddingLeft: '12px',
                }}>{c.hook}</div>
              </div>
            )}
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
              Transcrição
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {transcript}
            </div>
          </div>

          {/* Preview do vídeo */}
          <div style={{ padding: '18px', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Preview
            </div>
            <div style={{
              width: '100%', aspectRatio: '9/16', background: '#000',
              borderRadius: '8px', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {videoUrl ? <VideoEmbed url={videoUrl} /> : (
                <div style={{ color: '#9ca3af', fontSize: '11px', textAlign: 'center', padding: '8px' }}>
                  Sem link de vídeo
                </div>
              )}
            </div>
            {videoUrl && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', wordBreak: 'break-all', lineHeight: 1.4 }}>
                {videoUrl}
              </div>
            )}

            {/* Formato — assista o vídeo e escolha/troque o formato */}
            <div style={{ marginTop: '4px' }}>
              <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
                Formato {savingFmt && <span style={{ color: 'var(--accent)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· salvando…</span>}
              </label>
              <SelectWithCreate value={format} onChange={saveFormat} kind="format" placeholder="Escolha o formato…" />
            </div>
          </div>
        </div>

        {/* Footer com ações */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--border-subtle)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap',
        }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '12px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            Fechar
          </button>
          {videoUrl && (
            <>
              <button
                onClick={copyLink}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                <Copy size={12} /> Copiar link
              </button>
              <a
                href={videoUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '7px', fontSize: '12px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'none' }}
              >
                <ExternalLink size={12} /> Abrir link
              </a>
            </>
          )}
          <button
            onClick={handleUseAsReference}
            className="tc-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', fontSize: '12px' }}
          >
            <BookOpen size={12} /> Usar como referência
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de Orgânico (estilo Ad mas mais simples) ─────────────────────────

const OrganicCard = memo(function OrganicCard({ swipe, onDelete, onEdit, onOpenTranscript, onEditOrganico }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const [obs, setObs] = useState(c.observations || '')
  const [savedObs, setSavedObs] = useState(c.observations || '')
  const [savingObs, setSavingObs] = useState(false)
  const obsDirty = obs !== savedObs
  const videoUrl = c.source_video_url || swipe.source || ''

  const handleSaveObs = async () => {
    setSavingObs(true)
    try {
      await onEdit(swipe.id, stringify({ ...c, observations: obs }))
      setSavedObs(obs)
      toast.success('Observações salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally { setSavingObs(false) }
  }

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '10px', padding: '14px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      {/* Header: tags + ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {c.niche  && <Chip color="accent">🎯 {c.niche}</Chip>}
          {c.format && <Chip>🎬 {c.format}</Chip>}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
          <button onClick={() => onEditOrganico(swipe)} style={btnStyle} title="Editar"><PenLine size={11} /></button>
          <button onClick={() => onDelete(swipe.id)} style={btnStyle} title="Remover"><Trash2 size={11} /></button>
        </div>
      </div>

      {/* Título */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {c.title || 'Vídeo orgânico'}
      </div>

      {/* Métricas do vídeo (views, likes, data de publicação) */}
      {(() => {
        const m = c.metadata || {}
        const hasMetrics = m.views || m.likes || m.published
        if (!hasMetrics) return null
        return (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-muted)', alignItems: 'center' }}>
            {m.views && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Visualizações">
                <Eye size={11} /> {m.views}
              </span>
            )}
            {m.likes && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Curtidas">
                <Heart size={11} /> {m.likes}
              </span>
            )}
            {m.published && m.published !== '—' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Data de publicação">
                <Calendar size={11} /> {m.published}
              </span>
            )}
          </div>
        )
      })()}

      {/* Hook preview (se houver) */}
      {c.hook && (
        <div style={{
          fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5,
          padding: '8px 10px', background: 'var(--bg-base)',
          borderRadius: '6px', borderLeft: '2px solid var(--accent)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {c.hook}
        </div>
      )}

      {/* Observações */}
      <div>
        <div className="tc-section-title" style={{ marginBottom: '4px', fontSize: '10px' }}>Observações</div>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="O que viu de interessante…"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
            borderRadius: '6px', padding: '7px 10px', fontSize: '12px',
            color: 'var(--text-secondary)', fontFamily: 'var(--font)', lineHeight: 1.5,
            minHeight: '44px',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5px' }}>
          <button
            onClick={handleSaveObs}
            disabled={!obsDirty || savingObs}
            style={{
              padding: '4px 11px', borderRadius: '5px', fontSize: '10px',
              background: obsDirty ? 'var(--accent)' : 'transparent',
              border: `1px solid ${obsDirty ? 'var(--accent)' : 'var(--border-default)'}`,
              color: obsDirty ? '#fff' : 'var(--text-muted)',
              cursor: obsDirty && !savingObs ? 'pointer' : 'default',
              fontFamily: 'var(--font)', fontWeight: 500,
            }}
          >
            {savingObs ? '...' : obsDirty ? 'OK' : 'Salvo'}
          </button>
        </div>
      </div>

      {/* Link do vídeo */}
      {videoUrl && (
        <a href={videoUrl} target="_blank" rel="noreferrer" style={{
          fontSize: '10px', color: 'var(--accent)', textDecoration: 'none',
          wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          🔗 {videoUrl.length > 40 ? videoUrl.slice(0, 40) + '…' : videoUrl}
        </a>
      )}

      {/* Botão acessar transcrição */}
      <button
        onClick={() => onOpenTranscript(swipe)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          padding: '7px 12px', borderRadius: '6px', fontSize: '11px',
          background: 'transparent', border: '1px solid #06b6d4', color: '#06b6d4',
          cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
        }}
      >
        <BookOpen size={11} /> Acessar transcrição
      </button>

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
        {formatDate(swipe.created_at)}
      </div>
    </div>
  )
})

// ─── EditOrganicoModal ─────────────────────────────────────────────────────

function EditOrganicoModal({ swipe, onClose, onSaved }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const [title, setTitle] = useState(c.title || '')
  const [niche, setNiche] = useState(c.niche || '')
  const [format, setFormat] = useState(c.format || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = { ...c, title, niche, format }
      await api.patch(`/swipes/${swipe.id}`, { content: stringify(updated) })
      toast.success('Atualizado!')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>Editar vídeo orgânico</div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>Título</label>
            <input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', fontSize: '13px' }} />
          </div>
          <SelectWithCreate label="Nicho"   value={niche}  onChange={setNiche}  kind="niche"  placeholder="Escolha…" />
          <SelectWithCreate label="Formato" value={format} onChange={setFormat} kind="format" placeholder="Escolha…" />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="tc-btn-primary">{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de Avatar ────────────────────────────────────────────────────────

const AvatarCard = memo(function AvatarCard({ swipe, onDelete, onUseAsReference, onInsertInCopy, onEdit }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const avatar = c.avatar || c
  const videoUrl = c.source_video_url || swipe.source
  // Aceita tanto descrição livre quanto fallback dos campos antigos (compat)
  const description = avatar.description || avatar.descricao || [
    avatar.genero, avatar.idade_aparente, avatar.roupa, avatar.ambiente, avatar.energia
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '8px', padding: '8px',
      display: 'flex', gap: '10px',
      alignItems: 'stretch',
      maxHeight: '160px',
    }}>
      {/* ── ESQUERDA: Preview encolhido via CSS scale ── */}
      <div style={{
        width: '80px', height: '142px', flexShrink: 0,
        borderRadius: '6px', overflow: 'hidden', background: '#000',
        position: 'relative',
      }}>
        {/* iframe nativo 325x575 escalado pra caber em 80x142 */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          transform: 'scale(0.246)',           // 80 / 325 = 0.246
          transformOrigin: 'top left',
          width: '325px', height: '575px',
        }}>
          <VideoEmbed url={videoUrl} />
        </div>
      </div>

      {/* ── DIREITA: Descrição + ações ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Ações no topo */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
          <button onClick={() => onEdit(swipe)} style={{ ...btnStyle, padding: '3px 5px' }} title="Editar"><Edit2 size={10} /></button>
          <button onClick={() => onDelete(swipe.id)} style={{ ...btnStyle, padding: '3px 5px' }} title="Remover"><Trash2 size={10} /></button>
        </div>

        {/* Descrição */}
        <div style={{
          fontSize: '11px',
          color: description ? 'var(--text-secondary)' : 'var(--text-muted)',
          fontStyle: description ? 'normal' : 'italic',
          lineHeight: 1.45,
          flex: 1, overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
        }}>
          {description || 'Sem descrição'}
        </div>

        {/* Data */}
        <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
          {formatDate(swipe.created_at)}
        </div>

        {/* Botões de ação (link + copy + insert) */}
        <div style={{ display: 'flex', gap: '4px', marginTop: 'auto' }}>
          {videoUrl && (
            <>
              <a href={videoUrl} target="_blank" rel="noreferrer" style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                fontSize: '11px', padding: '6px 8px', borderRadius: '5px',
                background: 'var(--accent)', color: '#fff', textDecoration: 'none',
                fontFamily: 'var(--font)', fontWeight: 500,
              }}>
                🔗 Abrir
              </a>
              <button
                onClick={() => { navigator.clipboard.writeText(videoUrl); toast.success('Link copiado!') }}
                title="Copiar link"
                style={{
                  padding: '6px 8px', borderRadius: '5px', fontSize: '11px',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: '3px',
                }}
              >
                <Copy size={11} />
              </button>
            </>
          )}
          <button
            onClick={() => onInsertInCopy(swipe)}
            title="Inserir avatar em uma copy"
            style={{
              padding: '6px 8px', borderRadius: '5px', fontSize: '11px',
              background: 'transparent', border: '1px solid #8b5cf6', color: '#8b5cf6',
              cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: '3px',
            }}
          >
            <PenLine size={11} /> Copy
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── Modal: Editar Avatar ──────────────────────────────────────────────────

function EditAvatarModal({ swipe, onClose, onSaved }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const avatar = c.avatar || {}
  const initialDesc = avatar.description || avatar.descricao || [
    avatar.genero, avatar.idade_aparente, avatar.roupa, avatar.ambiente, avatar.energia
  ].filter(Boolean).join(' · ')

  const [desc, setDesc] = useState(initialDesc)
  const [link, setLink] = useState(c.source_video_url || swipe.source || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const newContent = {
        ...c,
        avatar: { description: desc.trim() },
        source_video_url: link.trim() || null,
      }
      const stringified = JSON.stringify(newContent)
      await api.patch(`/swipes/${swipe.id}`, {
        content: stringified,
        source: link.trim() || null,
      })
      onSaved(swipe.id, stringified, link.trim() || null)
      toast.success('Atualizado!')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '20px', maxWidth: '500px', width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Editar Avatar</div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="tc-label">Link do vídeo (TikTok/YT/IG)</label>
            <input className="tc-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://tiktok.com/..." />
          </div>
          <div>
            <label className="tc-label">Descrição do avatar</label>
            <textarea
              className="tc-input tc-textarea"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              placeholder="Ex: Mulher 30+, casual, fala empolgada..."
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="tc-btn-primary">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Inserir Avatar em Copy ─────────────────────────────────────────

function InsertAvatarInCopyModal({ swipe, onClose }) {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [inserting, setInserting] = useState(null)

  const c = swipe._parsed || parseContent(swipe.content)
  const avatar = c.avatar || c
  const description = avatar.description || avatar.descricao || [
    avatar.genero, avatar.idade_aparente, avatar.roupa, avatar.ambiente, avatar.energia,
  ].filter(Boolean).join(' · ')
  const videoUrl = c.source_video_url || swipe.source

  useEffect(() => {
    api.get('/drafts').then(r => setDrafts(r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return drafts
    const s = search.toLowerCase()
    return drafts.filter(d => (d.title || '').toLowerCase().includes(s))
  }, [drafts, search])

  const handleInsert = async (draft) => {
    setInserting(draft.id)
    try {
      const currentFields = draft.fields_data || {}
      const currentAvatar = (currentFields.avatar || '').trim()
      // Anexa a descrição do avatar no campo avatar do draft (acumula)
      const newAvatar = currentAvatar
        ? `${currentAvatar}\n\n— Adicionado do Swipe —\n${description}${videoUrl ? `\nLink: ${videoUrl}` : ''}`
        : `${description}${videoUrl ? `\nLink: ${videoUrl}` : ''}`

      await api.patch(`/drafts/${draft.id}`, {
        fields_data: { ...currentFields, avatar: newAvatar },
      })
      toast.success(`Avatar inserido em "${draft.title || 'copy'}"`)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao inserir')
    } finally {
      setInserting(null)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '20px', maxWidth: '500px', width: '100%',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PenLine size={16} style={{ color: '#8b5cf6' }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Inserir avatar em qual copy?
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>

        {/* Preview da descrição */}
        <div style={{
          padding: '10px 12px', borderRadius: '6px', marginBottom: '12px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5,
        }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
            Vai inserir:
          </div>
          {description || '(sem descrição)'}
        </div>

        {/* Busca */}
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search size={12} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: 'var(--text-muted)' }} />
          <input
            className="tc-input"
            placeholder="Buscar copy pelo nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '30px', fontSize: '13px' }}
            autoFocus
          />
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              Carregando copies...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {search ? 'Nenhuma copy encontrada' : 'Você ainda não tem nenhuma copy salva. Crie uma em "Escrever".'}
            </div>
          ) : (
            filtered.map(d => (
              <button
                key={d.id}
                onClick={() => handleInsert(d)}
                disabled={inserting === d.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: '6px', textAlign: 'left',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  cursor: inserting === d.id ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                  transition: 'border-color 0.15s', opacity: inserting === d.id ? 0.6 : 1,
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title || 'Copy sem título'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {formatDate(d.created_at)}
                    {d.fields_data?.avatar && <span style={{ marginLeft: '6px', color: '#22c55e' }}>● já tem avatar</span>}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: '#8b5cf6', flexShrink: 0, marginLeft: '8px' }}>
                  {inserting === d.id ? '...' : '+ Inserir'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Editar Hook ──────────────────────────────────────────────────

function EditHookModal({ swipe, allCustomHookTypes, onClose, onSaved }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const [hookText, setHookText] = useState(c.hook || c.raw || swipe.content)
  const [title, setTitle] = useState(c.title || '')
  const [hookType, setHookType] = useState(c.hook_type || '')
  const [emotion, setEmotion] = useState(c.emotion || '')
  const [status, setStatus] = useState(c.status || 'inspiracao')
  const [niche, setNiche] = useState(c.niche || '')
  const [tagsInput, setTagsInput] = useState((c.custom_tags || []).join(', '))
  const [newTypeInput, setNewTypeInput] = useState('')
  const [showNewType, setShowNewType] = useState(false)
  const [saving, setSaving] = useState(false)

  // Lista combinada de tipos (fixos + custom + selecionado atual mesmo se único)
  const allTypes = useMemo(() => {
    const set = new Set([...Object.keys(TYPE_META), ...allCustomHookTypes])
    if (hookType) set.add(hookType)
    return Array.from(set)
  }, [allCustomHookTypes, hookType])

  const handleNewType = () => {
    const v = newTypeInput.trim().toLowerCase().replace(/\s+/g, '_')
    if (!v) return
    setHookType(v)
    setNewTypeInput('')
    setShowNewType(false)
  }

  const handleSave = async () => {
    if (!hookText.trim()) return toast.error('Hook não pode ficar vazio')
    setSaving(true)
    try {
      const customTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const updated = {
        ...c,
        hook: hookText.trim(),
        title: title.trim() || null,
        hook_type: hookType || null,
        emotion: emotion || null,
        status,
        niche: niche.trim() || null,
        custom_tags: customTags,
      }
      await api.patch(`/swipes/${swipe.id}`, { content: stringify(updated) })
      toast.success('Hook atualizado!')
      onSaved(swipe.id, stringify(updated))
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '24px', maxWidth: '600px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Editar Hook
          </div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Hook */}
          <div>
            <label className="tc-label">Hook *</label>
            <textarea
              className="tc-input"
              value={hookText}
              onChange={(e) => setHookText(e.target.value)}
              rows={4}
              style={{ resize: 'vertical', fontSize: '13px', lineHeight: 1.55 }}
            />
          </div>

          {/* Título */}
          <div>
            <label className="tc-label">Título de referência (opcional)</label>
            <input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: VSL da Amanda" />
          </div>

          {/* Tipo + Emoção (lado a lado) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="tc-label">Tipo de hook</label>
              {showNewType ? (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    className="tc-input"
                    value={newTypeInput}
                    onChange={(e) => setNewTypeInput(e.target.value)}
                    placeholder="ex: comparacao"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleNewType() }}
                    style={{ fontSize: '12px' }}
                  />
                  <button onClick={handleNewType} style={{ ...btnStyle, padding: '0 10px', color: '#22c55e', borderColor: '#22c55e' }}><Check size={12} /></button>
                  <button onClick={() => { setShowNewType(false); setNewTypeInput('') }} style={{ ...btnStyle, padding: '0 10px' }}><X size={12} /></button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select
                    className="tc-input"
                    value={hookType}
                    onChange={(e) => setHookType(e.target.value)}
                    style={{ fontSize: '12px', flex: 1 }}
                  >
                    <option value="">— Nenhum —</option>
                    <optgroup label="Tipos fixos">
                      {Object.entries(TYPE_META).map(([key, m]) => (
                        <option key={key} value={key}>{m.label}</option>
                      ))}
                    </optgroup>
                    {allCustomHookTypes.length > 0 && (
                      <optgroup label="Tipos custom">
                        {allCustomHookTypes.map(t => (
                          <option key={t} value={t}>{customTypeLabel(t)}</option>
                        ))}
                      </optgroup>
                    )}
                    {hookType && !Object.keys(TYPE_META).includes(hookType) && !allCustomHookTypes.includes(hookType) && (
                      <option value={hookType}>{customTypeLabel(hookType)}</option>
                    )}
                  </select>
                  <button
                    onClick={() => setShowNewType(true)}
                    title="Criar tipo novo"
                    style={{ ...btnStyle, padding: '0 10px', color: '#8b5cf6', borderColor: '#8b5cf680' }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="tc-label">Emoção</label>
              <select
                className="tc-input"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                style={{ fontSize: '12px' }}
              >
                <option value="">— Nenhuma —</option>
                {Object.entries(EMOTION_META).map(([key, m]) => (
                  <option key={key} value={key}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status + Nicho */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="tc-label">Status</label>
              <select
                className="tc-input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ fontSize: '12px' }}
              >
                {Object.entries(STATUS_META).map(([key, m]) => (
                  <option key={key} value={key}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <SelectWithCreate label="Nicho" value={niche} onChange={setNiche} kind="niche" placeholder="Escolha o nicho…" />
            </div>
          </div>

          {/* Custom tags */}
          <div>
            <label className="tc-label">Tags customizadas (separadas por vírgula)</label>
            <input
              className="tc-input"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="ex: viral, amanda-khayat, bateu-controle"
            />
            {(tagsInput.split(',').map(t => t.trim()).filter(Boolean).length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {tagsInput.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} style={{
                    fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
                    background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#8b5cf6',
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="tc-btn-primary">
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Adicionar Manualmente ────────────────────────────────────────

function AddSwipeModal({ tab, onClose, onSaved }) {
  // Estados específicos por tipo
  const [hookText, setHookText] = useState('')
  const [hookTitle, setHookTitle] = useState('')

  const [adTitle, setAdTitle] = useState('')
  const [adHook, setAdHook] = useState('')
  const [adBody, setAdBody] = useState('')

  const [avatarDesc, setAvatarDesc] = useState('')

  // Comum
  const [source, setSource] = useState('')
  const [niche, setNiche] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    let content = {}
    if (tab === 'hook') {
      if (!hookText.trim()) return toast.error('Hook obrigatório')
      content = { hook: hookText, title: hookTitle || null, source: 'manual' }
      content.niche = niche.trim() || null
      const customTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      if (customTags.length) content.custom_tags = customTags
    } else if (tab === 'ad') {
      if (!adHook.trim() && !adBody.trim()) return toast.error('Preencha pelo menos hook ou body')
      content = { title: adTitle || null, hook_written: adHook, body: adBody }
      content.niche = niche.trim() || null
      const customTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      if (customTags.length) content.custom_tags = customTags
    } else {
      // AVATAR: descrição livre + link
      if (!avatarDesc.trim()) return toast.error('Escreva a descrição do avatar')
      content = {
        avatar: { description: avatarDesc.trim() },
        source_video_url: source.trim() || null,
      }
    }

    setSaving(true)
    try {
      await api.post('/swipes', {
        tag: tab,
        content: stringify(content),
        source: source.trim() || null,
      })
      toast.success('Salvo no swipe!')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '24px', maxWidth: '560px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Novo {tab === 'hook' ? 'Hook' : tab === 'ad' ? 'Anúncio' : 'Avatar'}
          </div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tab === 'hook' && (
            <>
              <div>
                <label className="tc-label">Hook *</label>
                <textarea
                  className="tc-input"
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  rows={4}
                  placeholder="Cole o hook aqui..."
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div>
                <label className="tc-label">Título de referência (opcional)</label>
                <input className="tc-input" value={hookTitle} onChange={(e) => setHookTitle(e.target.value)} placeholder="Ex: VSL da Amanda" />
              </div>
            </>
          )}

          {tab === 'ad' && (
            <>
              <div>
                <label className="tc-label">Título (opcional)</label>
                <input className="tc-input" value={adTitle} onChange={(e) => setAdTitle(e.target.value)} placeholder="Ex: Vicks VapoRub - $7" />
              </div>
              <div>
                <label className="tc-label">Hook</label>
                <textarea className="tc-input" value={adHook} onChange={(e) => setAdHook(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
              </div>
              <div>
                <label className="tc-label">Body</label>
                <textarea className="tc-input" value={adBody} onChange={(e) => setAdBody(e.target.value)} rows={8} style={{ resize: 'vertical' }} placeholder="Corpo do anúncio..." />
              </div>
            </>
          )}

          {tab === 'avatar' && (
            <div>
              <label className="tc-label">Descrição do avatar *</label>
              <textarea
                className="tc-input tc-textarea"
                value={avatarDesc}
                onChange={(e) => setAvatarDesc(e.target.value)}
                placeholder="Ex: Mulher 30+, no carro com bebê no colo, casual, fala empolgada"
                rows={4}
                style={{ resize: 'vertical', fontSize: '13px' }}
              />
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

          {tab === 'avatar' ? (
            // Avatar: SÓ link do vídeo (sem nicho, sem custom tags)
            <div>
              <label className="tc-label">Link do vídeo (opcional)</label>
              <input className="tc-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://tiktok.com/... (vai gerar preview)" />
            </div>
          ) : (
            // Hook e Ad: nicho + link + custom tags
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="tc-label">Nicho</label>
                  <input className="tc-input" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="ex: emagrecimento" />
                </div>
                <div>
                  <label className="tc-label">Link/fonte (opcional)</label>
                  <input className="tc-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div>
                <label className="tc-label">Tags customizadas (vírgula)</label>
                <input className="tc-input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ex: viral, conspiração, vsl-longa" />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="tc-btn-primary">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Import em massa ─────────────────────────────────────────────────

function ImportModal({ tab, onClose, onSaved }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])  // pra ad (vídeos do computador)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const fileInputRef = useRef(null)

  const isAvatar = tab === 'avatar'
  const isAd = tab === 'ad'
  const lineCount = text.split('\n').filter(l => l.trim()).length

  const handleFilesPicked = (e) => {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    setFiles((prev) => [...prev, ...picked])
    e.target.value = ''
  }

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleImportFiles = async () => {
    if (!files.length) return toast.error('Selecione pelo menos um vídeo')
    setImporting(true)
    setProgress({ done: 0, total: files.length })
    let okCount = 0
    let failCount = 0
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        const form = new FormData()
        form.append('file', f)
        form.append('tag', 'ad')
        form.append('title', f.name.replace(/\.[^.]+$/, ''))
        await api.post('/videos/upload-to-swipe', form)
        okCount++
      } catch (err) {
        failCount++
      }
      setProgress({ done: i + 1, total: files.length })
    }
    setImporting(false)
    if (okCount) toast.success(`${okCount} vídeo(s) importado(s)!`)
    if (failCount) toast.error(`${failCount} falhou(aram) ao subir`)
    onSaved()
    if (okCount) onClose()
  }

  const handleImport = async () => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return toast.error('Cole pelo menos uma linha')

    const items = lines.map(line => {
      let content = {}
      let source = null

      if (tab === 'hook') {
        content = { hook: line, source: 'manual' }
      } else {
        // AVATAR: formato "descrição | link" ou só "descrição"
        const [descPart, linkPart] = line.split('|').map(p => (p || '').trim())
        content = {
          avatar: { description: descPart || '' },
          source_video_url: linkPart || null,
        }
        source = linkPart || null
      }

      return {
        tag: tab,
        content: stringify(content),
        source,
      }
    })

    setImporting(true)
    try {
      const res = await api.post('/swipes/bulk-import', { items })
      toast.success(`${res.data.imported} importado(s)!`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao importar')
    } finally {
      setImporting(false)
    }
  }

  const totalSizeMb = files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '24px', maxWidth: '600px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>
            Importar {isAvatar ? 'avatares' : tab + 's'} em massa
          </div>
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px' }}><X size={14} /></button>
        </div>

        {isAd ? (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.6 }}>
              Selecione <strong>vários vídeos</strong> do seu computador. Eles vão direto pro Swipe.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.webm,.mkv"
              multiple
              onChange={handleFilesPicked}
              style={{ display: 'none' }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              style={{
                width: '100%', padding: '24px', borderRadius: '10px',
                border: '2px dashed var(--border-default)', background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)', cursor: importing ? 'wait' : 'pointer',
                fontFamily: 'var(--font)', fontSize: '13px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              }}
            >
              <Upload size={20} />
              <span>Clique pra escolher vídeos do computador</span>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>MP4, MOV, WebM, MKV — múltipla seleção</span>
            </button>

            {files.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>{files.length}</strong> vídeo(s) selecionado(s)</span>
                  <span>{totalSizeMb.toFixed(1)} MB</span>
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '6px',
                      background: 'var(--bg-elevated)', fontSize: '12px',
                    }}>
                      <Video size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ opacity: 0.6, fontSize: '11px' }}>{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                      {!importing && (
                        <button onClick={() => removeFile(i)} style={{ ...btnStyle, padding: '2px 6px' }}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importing && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Subindo {progress.done}/{progress.total}…
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button onClick={onClose} disabled={importing} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Cancelar
              </button>
              <button onClick={handleImportFiles} disabled={importing || files.length === 0} className="tc-btn-primary">
                {importing ? `Subindo ${progress.done}/${progress.total}…` : `Importar ${files.length} vídeo(s)`}
              </button>
            </div>
          </>
        ) : (
          <>
            {isAvatar ? (
              <div style={{
                padding: '12px 14px', borderRadius: '8px',
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 600, color: '#8b5cf6', marginBottom: '4px' }}>📋 Formato</div>
                Cada linha = <strong>descrição | link</strong> (separados por <code style={{ background: 'var(--bg-elevated)', padding: '0 4px', borderRadius: '3px' }}>|</code>)
                <br />Se não tiver link, deixe só a descrição.
                <div style={{ marginTop: '8px', fontFamily: 'monospace', fontSize: '11px', opacity: 0.8 }}>
                  Mulher 30+ com bebê, casual | https://tiktok.com/...<br />
                  Homem 40+ no escritório, terno | https://tiktok.com/...<br />
                  Avatar sem link, só descrição
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.6 }}>
                Cole <strong>1 {tab} por linha</strong>. Cada linha vira uma entrada.
              </p>
            )}

            <textarea
              className="tc-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder={isAvatar
                ? 'Mulher 30+ com bebê, casual | https://tiktok.com/...\nHomem 40+ no escritório, terno | https://tiktok.com/...\nAvatar sem link'
                : `Linha 1 — primeiro ${tab}\nLinha 2 — segundo ${tab}\nLinha 3 — terceiro...`
              }
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Cancelar
              </button>
              <button onClick={handleImport} disabled={importing || lineCount === 0} className="tc-btn-primary">
                {importing ? 'Importando...' : `Importar ${lineCount} item(ns)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Grid virtualizado (renderiza só cards visíveis na tela) ──────────────
//
// Por que: com 100+ cards, renderizar todos de uma vez trava a UI.
// VirtuosoGrid usa scroll virtualization — mantém apenas ~30 cards no DOM,
// e troca conforme o scroll. Escala pra milhares sem perder performance.

const VirtualGridListWrapper = forwardRef(({ children, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(var(--vsg-min, 280px), 1fr))`,
      gap: '12px',
    }}
  >
    {children}
  </div>
))

function VirtualizedSwipeGrid({ items, renderCard, minCardWidth, tab }) {
  // Threshold: só vale a pena virtualizar acima disso. Abaixo, renderiza normal
  // (evita overhead do Virtuoso pra listas pequenas).
  if (items.length <= 30) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`,
        gap: '12px',
      }}>
        {items.map(renderCard)}
      </div>
    )
  }
  return (
    <VirtuosoGrid
      style={{ height: 'calc(100vh - 280px)', '--vsg-min': `${minCardWidth}px` }}
      data={items}
      totalCount={items.length}
      overscan={400}
      components={{ List: VirtualGridListWrapper }}
      itemContent={(_, item) => renderCard(item)}
      computeItemKey={(_, item) => item.id}
    />
  )
}

// ─── Modal: Ver detalhes do anúncio (todas infos + vídeo ao lado) ──────────

function AdDetailsModal({ swipe, onClose, onUseAsReference, onEdit }) {
  const c = swipe._parsed || parseContent(swipe.content)
  const hasVideo = !!(c.video || c.has_video)

  // Campos editáveis
  const [fields, setFields] = useState({
    title: c.title || '',
    hook_visual: c.hook_visual || '',
    hook_written: c.hook_written || c.hook || '',
    body: c.body || '',
  })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const set = (k, v) => { setFields(f => ({ ...f, [k]: v })); setDirty(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = { ...c, ...fields }
      // hook_written é o campo canônico do ad; remove hook duplicado se existir
      await onEdit?.(swipe.id, stringify(updated))
      setDirty(false)
      toast.success('Alterações salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // Textarea que cresce com o conteúdo (sem scroll interno — mostra tudo)
  const autoGrow = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }
  const Field = ({ label, k, rows = 2 }) => (
    <div style={{ marginBottom: '14px' }}>
      <div className="tc-section-title" style={{ marginBottom: '5px' }}>{label}</div>
      <textarea
        value={fields[k]}
        onChange={(e) => { set(k, e.target.value); autoGrow(e.target) }}
        ref={autoGrow}
        rows={rows}
        placeholder={`(vazio)`}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'none', overflow: 'hidden',
          background: 'var(--bg-base)', border: '1px solid var(--border-default)',
          borderRadius: '7px', padding: '9px 11px', fontSize: '13px',
          color: 'var(--text-primary)', fontFamily: 'var(--font)', lineHeight: 1.6,
        }}
      />
    </div>
  )

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', width: '100%', maxWidth: '960px', height: '88vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <input
            value={fields.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Título do anúncio"
            style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font)', marginRight: '12px' }}
          />
          <button onClick={onClose} style={{ ...btnStyle, padding: '4px 8px', flexShrink: 0 }}><X size={14} /></button>
        </div>

        {/* Corpo: vídeo à esquerda (altura total), infos roláveis à direita */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {hasVideo && (
            <div style={{ width: '42%', minWidth: '300px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px', overflow: 'hidden' }}>
              <video
                controls
                src={null}
                ref={(el) => {
                  // carrega a URL presigned 1x ao montar
                  if (el && !el.dataset.loaded) {
                    el.dataset.loaded = '1'
                    api.get(`/videos/playback/${swipe.id}`).then(r => { el.src = r.data.url }).catch(() => {})
                  }
                }}
                style={{ width: '100%', maxHeight: '100%', borderRadius: '8px', background: '#000' }}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 20px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {c.niche && <Chip color="accent">{c.niche}</Chip>}
              {c.format && <Chip>{c.format}</Chip>}
              {adNeedsTranscription(c) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}>
                  <Clock size={11} /> Transcrição pendente
                </span>
              )}
            </div>

            <Field label="Hook visual" k="hook_visual" rows={3} />
            <Field label="Hook" k="hook_written" rows={2} />
            <Field label="Body" k="body" rows={6} />

            {/* Avatar (extraído pela análise visual do Gemini) */}
            {c.avatar && Object.values(c.avatar).some(Boolean) && (
              <div style={{ marginBottom: '14px' }}>
                <div className="tc-section-title" style={{ marginBottom: '6px' }}>Avatar</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {Object.entries(c.avatar).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <b style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</b> {String(v)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Edição (extraído pela análise visual do Gemini) */}
            {((c.editing && Object.values(c.editing).some(Boolean)) || c.duration) && (
              <div style={{ marginBottom: '14px' }}>
                <div className="tc-section-title" style={{ marginBottom: '6px' }}>Edição</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {c.duration && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}><b>Duração:</b> {c.duration}</div>}
                  {c.editing && Object.entries(c.editing).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <b style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</b> {String(v)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer fixo com ações */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <button
            onClick={() => { onClose(); onUseAsReference?.(swipe) }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            <BookOpen size={14} /> Usar como referência
          </button>
          <button onClick={handleSave} disabled={!dirty || saving} className="tc-btn-primary" style={{ opacity: (!dirty || saving) ? 0.5 : 1 }}>
            {saving ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Salvo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: anúncio sem transcrição → oferece transcrever antes de usar ─────

function TranscribePendingModal({ swipe, onClose, onTranscribed, onUseAnyway, navigateAfter = true }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const start = async () => {
    setRunning(true); setError('')
    try {
      const res = await api.post(`/videos/transcribe-swipe/${swipe.id}`)
      const jobId = res.data.job_id
      pollRef.current = setInterval(async () => {
        try {
          const st = await api.get(`/videos/transcribe-swipe/status/${jobId}`)
          if (st.data.status === 'done') {
            clearInterval(pollRef.current)
            const c = swipe._parsed || parseContent(swipe.content)
            const r = st.data.result || {}
            // Mescla tudo que a análise (Gemini) extraiu: textos + avatar + edição
            const updated = { ...c }
            if (r.body) { updated.body = r.body; updated.transcript_full = r.body }
            if (r.hook) updated.hook_written = r.hook
            if (r.hook_visual) updated.hook_visual = r.hook_visual
            if (r.video_format) updated.format = r.video_format
            if (r.avatar && Object.keys(r.avatar).length) updated.avatar = r.avatar
            if (r.editing && Object.keys(r.editing).length) updated.editing = r.editing
            onTranscribed({ ...swipe, content: stringify(updated), _parsed: updated })
          } else if (st.data.status === 'error') {
            clearInterval(pollRef.current)
            setRunning(false)
            setError(st.data.error || 'Erro na transcrição')
          }
        } catch { /* tenta de novo */ }
      }, 3000)
    } catch (err) {
      setRunning(false)
      setError(err.response?.data?.detail || 'Falha ao iniciar transcrição')
    }
  }

  return (
    <div onClick={running ? undefined : onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '24px', maxWidth: '460px', width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Clock size={18} style={{ color: '#f59e0b' }} />
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Anúncio sem transcrição</div>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
          Esse anúncio foi subido como vídeo e ainda não tem análise. Pra usar bem como
          referência, vale analisar agora (leva 1 a 2 minutos). Quer analisar?
        </p>

        {error && (
          <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '12px' }}>{error}</div>
        )}

        {running ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
            <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 0.9s linear infinite' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Analisando o vídeo… pode aguardar.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
              Cancelar
            </button>
            {navigateAfter && (
              <button onClick={onUseAnyway} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Usar mesmo assim
              </button>
            )}
            <button onClick={start} className="tc-btn-primary">
              Transcrever agora
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────

export default function SwipePage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('hook')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingHook, setEditingHook] = useState(null)  // swipe sendo editado
  const [insertingAvatarInCopy, setInsertingAvatarInCopy] = useState(null) // avatar swipe escolhido pra inserir em uma copy
  const [editingAvatar, setEditingAvatar] = useState(null) // avatar swipe sendo editado
  const [editingAd, setEditingAd] = useState(null) // ad swipe sendo editado
  const [editingOrganico, setEditingOrganico] = useState(null) // orgânico sendo editado
  const [viewingTranscript, setViewingTranscript] = useState(null) // swipe com transcrição em popup
  const [selectedOrganicoNiche, setSelectedOrganicoNiche] = useState(null) // pasta de nicho aberta no organico
  const [showUploadAds, setShowUploadAds] = useState(false) // upload unificado de ads
  const [transcribePending, setTranscribePending] = useState(null) // anúncio sem transcrição que vai virar referência
  const [analyzing, setAnalyzing] = useState([]) // análises em segundo plano [{swipeId, title, status, error}]
  const [detailsAd, setDetailsAd] = useState(null) // anúncio aberto no popup "Ver detalhes"
  const [storageRefresh, setStorageRefresh] = useState(0) // bump pra recalcular MB do R2
  const [selectedAdNiche, setSelectedAdNiche] = useState(null) // pasta de nicho aberta
  const [selectedHookNiche, setSelectedHookNiche] = useState(null) // pasta de nicho aberta nos hooks
  // Atribuir nicho em massa (à pasta atual)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkNicheValue, setBulkNicheValue] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const allNichesForBulk = useAllNiches()
  const addNiche = useTaxonomyStore((s) => s.addNiche)

  // Filtros (swipe é a nível de conta — sem filtro de projeto)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')   // filter por tag customizada
  const [sourceFilter, setSourceFilter] = useState('all')  // 'all' | 'ad' | 'organic' | 'manual' — só usado em hook
  const [sortBy, setSortBy] = useState('recent')  // 'recent' | 'views' | 'likes' — ordenação dos cards

  // Counts cacheados — não zeram ao desmontar/remontar a página
  // Versão v2 incluída pra invalidar cache antigo que não tinha "organico"
  const countsQuery = useQuery({
    queryKey: ['swipes', 'counts', 'v2'],
    queryFn: () => api.get('/swipes/counts').then(r => r.data),
    placeholderData: (prev) => prev,
    refetchOnMount: 'always',  // garante fetch fresco sempre que monta
  })
  const counts = countsQuery.data || { hook: 0, ad: 0, organico: 0, avatar: 0 }
  const loadCounts = () => queryClient.invalidateQueries({ queryKey: ['swipes', 'counts', 'v2'] })

  // ── Cache de swipes por (tab, searchDebounced) via useQuery ──
  // staleTime 30s = trocar entre tabs e voltar = instantâneo, sem refetch.
  // Mantém em memória 5min mesmo se a página desmontar.
  const [searchDebounced, setSearchDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const swipesQuery = useQuery({
    queryKey: ['swipes', tab, searchDebounced],
    queryFn: async () => {
      const params = new URLSearchParams({ tag: tab })
      if (searchDebounced.trim()) params.set('search', searchDebounced.trim())
      const res = await api.get(`/swipes?${params.toString()}`)
      // Pre-parseia o content 1x por swipe (evita JSON.parse repetido nos useMemo)
      return (res.data || []).map(s => ({ ...s, _parsed: parseContent(s.content) }))
    },
  })

  const swipes = swipesQuery.data || []
  const loading = swipesQuery.isLoading

  // Atualizar local quando mutar (delete/edit/update) sem refetch.
  // Usa refs pra mirar SEMPRE a aba/busca atual — handlers memoizados (useCallback [])
  // capturam um setSwipes antigo; sem os refs ele escreveria no cache da aba errada
  // (bug: apagava um ad e o card não saía da tela até dar F5).
  const tabRef = useRef(tab); tabRef.current = tab
  const searchRef = useRef(searchDebounced); searchRef.current = searchDebounced
  const setSwipes = (updater) => {
    queryClient.setQueryData(['swipes', tabRef.current, searchRef.current], (old) => {
      const current = old || []
      return typeof updater === 'function' ? updater(current) : updater
    })
  }
  // Força refetch quando precisar (ex: depois de criar novo)
  // Invalida TODAS as queries de lista de swipe (qualquer tab/busca). Usar a chave
  // ampla evita o bug de invalidar a tab errada quando chamado de handler memoizado
  // (useCallback []) que capturou um `tab` antigo. NÃO inclui ['swipes','counts'].
  const load = () => queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'swipes' && q.queryKey[1] !== 'counts',
  })

  // (counts agora vêm via useQuery — cache 30s + persistência entre remounts)

  // useCallback nos handlers passados aos cards — estabiliza a referência pra
  // React.memo funcionar. Sem isso, cada render de SwipePage cria novas funções
  // e força os cards (e seus iframes de vídeo) a re-renderizar.
  const handleDelete = useCallback(async (id) => {
    if (!(await confirmAction({ title: 'Remover do swipe?', message: 'Essa ação não pode ser desfeita.', confirmLabel: 'Remover' }))) return
    try {
      await api.delete(`/swipes/${id}`)
      // Remoção otimista em TODAS as queries de swipe (qualquer tab/busca em cache),
      // pra o card sumir na hora mesmo se a query ativa não for a que esperávamos.
      queryClient.setQueriesData({ queryKey: ['swipes'] }, (old) =>
        Array.isArray(old) ? old.filter((s) => s.id !== id) : old
      )
      // Garante sincronia com o backend (re-busca a lista da tab atual)
      load()
      loadCounts()
      setStorageRefresh(n => n + 1)   // recalcula o uso de R2 (vídeo removido)
      toast.success('Removido')
    } catch { toast.error('Erro ao remover') }
  }, []) // eslint-disable-line

  const handleEdit = useCallback(async (id, newContent) => {
    try {
      await api.patch(`/swipes/${id}`, { content: newContent })
      setSwipes((prev) => prev.map(s => s.id === id ? { ...s, content: newContent, _parsed: parseContent(newContent) } : s))
      toast.success('Atualizado')
    } catch { toast.error('Erro ao atualizar') }
  }, []) // eslint-disable-line

  const goToWriteWithReference = useCallback((swipe) => {
    sessionStorage.setItem('swipe_reference', JSON.stringify(swipe))
    toast.success('Indo para Escrever...')
    navigate('/criar-copy')
  }, [navigate])

  const handleUseAsReference = useCallback((swipe) => {
    // Anúncio com vídeo mas sem transcrição → pergunta se quer transcrever antes
    const c = swipe._parsed || parseContent(swipe.content)
    if (swipe.tag === 'ad' && adNeedsTranscription(c)) {
      setTranscribePending({ swipe, navigateAfter: true })
      return
    }
    goToWriteWithReference(swipe)
  }, [goToWriteWithReference])

  // Analisar direto do card (sem ir pra Escrever, sem modal travando a tela).
  // Mostra um indicador flutuante no canto e atualiza o card quando termina.
  const analyzeIntervals = useRef({})
  useEffect(() => () => { Object.values(analyzeIntervals.current).forEach(clearInterval) }, [])
  const startBackgroundAnalysis = useCallback(async (swipe) => {
    if (analyzing.some(a => a.swipeId === swipe.id)) return  // já rodando
    const c = swipe._parsed || parseContent(swipe.content)
    const title = c.title || 'Anúncio'
    setAnalyzing(prev => [...prev, { swipeId: swipe.id, title, status: 'running' }])
    try {
      const res = await api.post(`/videos/transcribe-swipe/${swipe.id}`)
      const jobId = res.data.job_id
      analyzeIntervals.current[swipe.id] = setInterval(async () => {
        try {
          const st = await api.get(`/videos/transcribe-swipe/status/${jobId}`)
          if (st.data.status === 'done') {
            clearInterval(analyzeIntervals.current[swipe.id]); delete analyzeIntervals.current[swipe.id]
            const r = st.data.result || {}
            const updated = { ...c }
            if (r.body) { updated.body = r.body; updated.transcript_full = r.body }
            if (r.hook) updated.hook_written = r.hook
            if (r.hook_visual) updated.hook_visual = r.hook_visual
            if (r.video_format) updated.format = r.video_format
            if (r.avatar && Object.keys(r.avatar).length) updated.avatar = r.avatar
            if (r.editing && Object.keys(r.editing).length) updated.editing = r.editing
            const newContent = stringify(updated)
            queryClient.setQueriesData({ queryKey: ['swipes'] }, (old) =>
              Array.isArray(old) ? old.map(s => s.id === swipe.id ? { ...s, content: newContent, _parsed: updated } : s) : old
            )
            setAnalyzing(prev => prev.filter(a => a.swipeId !== swipe.id))
            toast.success(`Análise pronta: ${title}`)
          } else if (st.data.status === 'error') {
            clearInterval(analyzeIntervals.current[swipe.id]); delete analyzeIntervals.current[swipe.id]
            setAnalyzing(prev => prev.map(a => a.swipeId === swipe.id ? { ...a, status: 'error', error: st.data.error } : a))
          }
        } catch { /* tenta de novo */ }
      }, 3000)
    } catch (err) {
      setAnalyzing(prev => prev.map(a => a.swipeId === swipe.id ? { ...a, status: 'error', error: err.response?.data?.detail || 'Falha ao iniciar' } : a))
    }
  }, [analyzing, queryClient]) // eslint-disable-line

  const handleTranscribeOnly = useCallback((swipe) => {
    startBackgroundAnalysis(swipe)
  }, [startBackgroundAnalysis])

  const handleUseHookInCopy = useCallback((swipe) => {
    try {
      const c = typeof swipe.content === 'string' ? JSON.parse(swipe.content) : swipe.content
      const hookText = c?.hook || c?.hook_written || ''
      if (!hookText.trim()) return toast.error('Esse swipe não tem hook pra usar')
      sessionStorage.setItem('prefill_hook', hookText.trim())
      toast.success('Hook carregado em Escrever')
      navigate('/criar-copy')
    } catch {
      toast.error('Erro ao usar hook')
    }
  }, [navigate])

  const handleReclassify = useCallback(async (id) => {
    try {
      const res = await api.post(`/swipes/classify/${id}`)
      setSwipes(prev => prev.map(s => {
        if (s.id !== id) return s
        try {
          const c = JSON.parse(s.content)
          c.hook_type = res.data.hook_type
          c.emotion = res.data.emotion
          const newContent = JSON.stringify(c)
          return { ...s, content: newContent, _parsed: parseContent(newContent) }
        } catch { return s }
      }))
      toast.success('Atualizado!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao atualizar')
    }
  }, []) // eslint-disable-line

  const [reclassifyingAll, setReclassifyingAll] = useState(false)
  const handleReclassifyAll = async () => {
    if (!(await confirmAction({ title: 'Atualizar todos os hooks sem tipo?', message: 'A IA vai classificar os hooks que ainda não têm tipo.', confirmLabel: 'Atualizar', danger: false }))) return
    setReclassifyingAll(true)
    try {
      const res = await api.post('/swipes/classify-all?only_missing=true')
      toast.success(`${res.data.classified} hook(s) atualizado(s)!`)
      load()
    } catch (err) {
      toast.error('Erro ao atualizar')
    } finally {
      setReclassifyingAll(false)
    }
  }

  const handleStatusChange = useCallback(async (id, newContent) => {
    try {
      await api.patch(`/swipes/${id}`, { content: stringify(newContent) })
      setSwipes(prev => prev.map(s => {
        if (s.id !== id) return s
        const stringified = stringify(newContent)
        return { ...s, content: stringified, _parsed: parseContent(stringified) }
      }))
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }, []) // eslint-disable-line

  // Atribui um nicho a TODOS os itens visíveis na pasta atual (ex: "Sem nicho").
  const assignNicheToFiltered = async () => {
    const nicheClean = (bulkNicheValue || '').trim()
    if (!nicheClean) return toast.error('Escolha um nicho')
    const targets = filteredSwipes
    if (targets.length === 0) return
    const ok = await confirmAction({
      title: `Atribuir o nicho "${nicheClean}" a ${targets.length} item${targets.length > 1 ? 's' : ''}?`,
      message: 'Todos os itens visíveis nesta pasta vão receber esse nicho de uma vez.',
      confirmLabel: 'Aplicar',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setBulkSaving(true)
    let done = 0
    for (const s of targets) {
      try {
        const c = s._parsed || parseContent(s.content) || {}
        const newContent = stringify({ ...c, niche: nicheClean })
        await api.patch(`/swipes/${s.id}`, { content: newContent })
        setSwipes(prev => prev.map(x => x.id === s.id ? { ...x, content: newContent, _parsed: parseContent(newContent) } : x))
        done++
      } catch { /* segue pros próximos */ }
    }
    setBulkSaving(false)
    setBulkOpen(false)
    setBulkNicheValue('')
    addNiche(nicheClean)          // garante o nicho na taxonomia
    loadCounts()
    // Se estávamos em "Sem nicho", os itens saíram dessa pasta → volta pra grade de nichos.
    if (tab === 'hook' && selectedHookNiche === '__sem_nicho__') setSelectedHookNiche(null)
    if (tab === 'ad' && selectedAdNiche === '__sem_nicho__') setSelectedAdNiche(null)
    if (tab === 'organico' && selectedOrganicoNiche === '__sem_nicho__') setSelectedOrganicoNiche(null)
    toast.success(`${done} item${done > 1 ? 's' : ''} movido${done > 1 ? 's' : ''} pra "${nicheClean}"`)
  }

  // Filtros por tag clicada (multi)
  const [activeTagFilters, setActiveTagFilters] = useState([])
  const handleTagClick = useCallback((kind, value) => {
    const key = `${kind}:${value}`
    setActiveTagFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }, [])
  const clearTagFilters = () => setActiveTagFilters([])

  // Filtra no client por tag + source + activeTagFilters
  const filteredSwipes = useMemo(() => {
    let list = swipes
    if (tagFilter.trim()) {
      const needle = tagFilter.toLowerCase()
      list = list.filter(s => {
        const c = s._parsed || parseContent(s.content)
        return (c.custom_tags || []).some(t => t.toLowerCase().includes(needle))
      })
    }
    if (tab === 'hook' && sourceFilter !== 'all') {
      list = list.filter(s => {
        const c = s._parsed || parseContent(s.content)
        return (c.source || 'manual') === sourceFilter
      })
    }
    // Filtro de "pasta de nicho" (só na aba ads, quando uma pasta está aberta)
    if (tab === 'ad' && selectedAdNiche) {
      list = list.filter(s => {
        const c = s._parsed || parseContent(s.content)
        const n = c.niche || '__sem_nicho__'
        return n === selectedAdNiche
      })
    }
    if (tab === 'organico' && selectedOrganicoNiche) {
      list = list.filter(s => {
        const c = s._parsed || parseContent(s.content)
        const n = c.niche || '__sem_nicho__'
        return n === selectedOrganicoNiche
      })
    }
    if (tab === 'hook' && selectedHookNiche) {
      list = list.filter(s => {
        const c = s._parsed || parseContent(s.content)
        const n = c.niche || '__sem_nicho__'
        return n === selectedHookNiche
      })
    }
    // Filtros por chip clicado (cada filtro é "kind:value", combinam com AND)
    if (activeTagFilters.length > 0) {
      list = list.filter(s => {
        const c = s._parsed || parseContent(s.content)
        return activeTagFilters.every(f => {
          const [kind, value] = f.split(':')
          if (kind === 'source')     return (c.source || 'manual') === value
          if (kind === 'hook_type')  return c.hook_type === value
          if (kind === 'emotion')    return c.emotion === value
          if (kind === 'status')     return (c.status || 'inspiracao') === value
          if (kind === 'niche')      return (c.niche || '') === value
          if (kind === 'custom_tag') return (c.custom_tags || []).includes(value)
          return true
        })
      })
    }
    // Ordenação (mais recentes / mais views / mais likes)
    if (sortBy === 'views' || sortBy === 'likes') {
      const key = sortBy
      list = [...list].sort((a, b) => {
        const ca = (a._parsed || parseContent(a.content)).metadata || {}
        const cb = (b._parsed || parseContent(b.content)).metadata || {}
        return parseMetricNum(cb[key]) - parseMetricNum(ca[key])
      })
    } else {
      // 'recent': data de publicação do vídeo (fallback: data em que foi salvo)
      list = [...list].sort((a, b) => {
        const ca = (a._parsed || parseContent(a.content)).metadata || {}
        const cb = (b._parsed || parseContent(b.content)).metadata || {}
        const pa = parsePublished(ca.published) || new Date(a.created_at || 0).getTime()
        const pb = parsePublished(cb.published) || new Date(b.created_at || 0).getTime()
        return pb - pa
      })
    }
    return list
  }, [swipes, tagFilter, sourceFilter, tab, activeTagFilters, selectedAdNiche, selectedOrganicoNiche, selectedHookNiche, sortBy])

  // Agrupamento de ads por nicho (pastas)
  const adNicheGroups = useMemo(() => {
    if (tab !== 'ad') return []
    const map = new Map()
    swipes.forEach(s => {
      const c = s._parsed || parseContent(s.content)
      const n = c.niche || '__sem_nicho__'
      if (!map.has(n)) map.set(n, { niche: n, count: 0, hasVideo: 0 })
      const g = map.get(n)
      g.count++
      if (c.video || c.has_video) g.hasVideo++
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.niche === '__sem_nicho__') return 1
      if (b.niche === '__sem_nicho__') return -1
      return b.count - a.count
    })
  }, [swipes, tab])

  // Mesmas pastas pra Orgânicos
  const organicoNicheGroups = useMemo(() => {
    if (tab !== 'organico') return []
    const map = new Map()
    swipes.forEach(s => {
      const c = s._parsed || parseContent(s.content)
      const n = c.niche || '__sem_nicho__'
      if (!map.has(n)) map.set(n, { niche: n, count: 0 })
      map.get(n).count++
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.niche === '__sem_nicho__') return 1
      if (b.niche === '__sem_nicho__') return -1
      return b.count - a.count
    })
  }, [swipes, tab])

  // Pastas de nicho pros Hooks
  const hookNicheGroups = useMemo(() => {
    if (tab !== 'hook') return []
    const map = new Map()
    swipes.forEach(s => {
      const c = s._parsed || parseContent(s.content)
      const n = c.niche || '__sem_nicho__'
      if (!map.has(n)) map.set(n, { niche: n, count: 0 })
      map.get(n).count++
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.niche === '__sem_nicho__') return 1
      if (b.niche === '__sem_nicho__') return -1
      return b.count - a.count
    })
  }, [swipes, tab])

  // Contagem por source (só pra mostrar nos chips)
  const sourceCounts = useMemo(() => {
    const counts = { all: swipes.length, ad: 0, organic: 0, manual: 0 }
    swipes.forEach(s => {
      const c = s._parsed || parseContent(s.content)
      const src = c.source || 'manual'
      if (counts[src] !== undefined) counts[src]++
    })
    return counts
  }, [swipes])

  // Lista de todas as tags customizadas pra dropdown
  const allCustomTags = useMemo(() => {
    const set = new Set()
    swipes.forEach(s => {
      const c = s._parsed || parseContent(s.content)
      ;(c.custom_tags || []).forEach(t => set.add(t))
    })
    return Array.from(set).sort()
  }, [swipes])

  // Lista de tipos custom de hook já criados (pra mostrar no dropdown do EditHookModal)
  const allCustomHookTypes = useMemo(() => {
    const fixed = new Set(Object.keys(TYPE_META))
    const set = new Set()
    swipes.forEach(s => {
      const c = parseContent(s.content)
      const ht = c.hook_type
      if (ht && !fixed.has(ht)) set.add(ht)
    })
    return Array.from(set).sort()
  }, [swipes])

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Swipe <span style={{ color: 'var(--accent)' }}>File</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Seu banco de referências — hooks, anúncios e avatares salvos para inspiração.
        </p>
      </div>

      {/* Tabs com contagem */}
      <div style={{ display: 'flex', gap: '3px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSelectedAdNiche(null); setSelectedOrganicoNiche(null) }}
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
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '999px',
              background: tab === key ? 'var(--accent)' : 'var(--bg-elevated)',
              color: tab === key ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              minWidth: '18px',
              textAlign: 'center',
            }}>
              {counts[key] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Busca */}
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '320px' }}>
          <Search size={12} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: 'var(--text-muted)' }} />
          <input
            className="tc-input"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '30px', fontSize: '12px' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}>
              <X size={11} />
            </button>
          )}
        </div>

        {/* Ordenação (só no Orgânico, que tem métricas de views/likes) */}
        {tab === 'organico' && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="tc-input"
            style={{ width: 'auto', fontSize: '12px', padding: '7px 10px' }}
            title="Ordenar"
          >
            <option value="recent">🕒 Mais recentes</option>
            <option value="views">👁️ Mais views</option>
            <option value="likes">❤️ Mais likes</option>
          </select>
        )}

        {/* Filtro de tag customizada */}
        {allCustomTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="tc-input"
            style={{ width: 'auto', fontSize: '12px', padding: '7px 10px' }}
          >
            <option value="">🏷️ Todas as tags</option>
            {allCustomTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {/* Ações */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {tab === 'ad' && <StorageUsageBadge refreshKey={storageRefresh} />}
          {tab === 'ad' ? (
            <button
              onClick={() => setShowUploadAds(true)}
              className="tc-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', fontSize: '12px' }}
            >
              <Upload size={12} /> Subir anúncios
            </button>
          ) : (
            <>
              {tab === 'organico' ? (
                // Aba Orgânicos: orgânico precisa ser TRANSCRITO antes de virar swipe,
                // então redireciona pro fluxo correto em Vídeos Orgânicos.
                <button
                  onClick={() => navigate('/organic')}
                  className="tc-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', fontSize: '12px' }}
                  title="Transcrever vídeos orgânicos pra salvar no swipe"
                >
                  <FileVideo size={12} /> Transcrever vídeos →
                </button>
              ) : (
                <>
                  <button onClick={() => setShowImport(true)} style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '7px 12px', borderRadius: '6px', fontSize: '12px',
                    background: 'transparent', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
                  }}>
                    <Upload size={12} /> Importar
                  </button>
                  <button onClick={() => setShowAdd(true)} className="tc-btn-primary" style={{
                    display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', fontSize: '12px',
                  }}>
                    <Plus size={12} /> Novo {tab === 'hook' ? 'hook' : 'avatar'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Barra de filtros ATIVOS (chips clicáveis pra remover) */}
      {activeTagFilters.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
          padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Filtros ativos:
          </span>
          {activeTagFilters.map(f => {
            const [kind, value] = f.split(':')
            const label = kind === 'hook_type' ? (getTypeMeta(value)?.label || value)
                        : kind === 'emotion' ? (EMOTION_META[value]?.label || value)
                        : kind === 'source' ? (SOURCE_META[value]?.label || value)
                        : kind === 'status' ? (STATUS_META[value]?.label || value)
                        : value
            return (
              <button
                key={f}
                onClick={() => setActiveTagFilters(prev => prev.filter(k => k !== f))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px',
                  background: '#8b5cf6', color: '#fff', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
                title="Clique pra remover"
              >
                {label}
                <X size={10} />
              </button>
            )
          })}
          <button
            onClick={clearTagFilters}
            style={{ fontSize: '11px', color: '#8b5cf6', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', fontFamily: 'var(--font)' }}
          >
            Limpar tudo
          </button>
        </div>
      )}

      {/* Filtro por SOURCE (só na aba Hook, dentro de uma pasta de nicho) */}
      {tab === 'hook' && selectedHookNiche && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, marginRight: '2px' }}>
            Origem:
          </span>
          {[
            { id: 'all',     label: 'Todos',         count: sourceCounts.all,     color: 'var(--text-primary)' },
            { id: 'ad',      label: 'Anúncio',  count: sourceCounts.ad,      color: 'var(--text-secondary)' },
            { id: 'organic', label: 'Orgânico', count: sourceCounts.organic, color: 'var(--text-secondary)' },
            { id: 'manual',  label: '✋ Manuais',     count: sourceCounts.manual,  color: '#64748b' },
          ].map(s => {
            const active = sourceFilter === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSourceFilter(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 10px', borderRadius: '999px', fontSize: '11px',
                  background: active ? `${s.color}15` : 'transparent',
                  border: `1px solid ${active ? s.color : 'var(--border-default)'}`,
                  color: active ? s.color : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span>{s.label}</span>
                <span style={{
                  fontSize: '9px', padding: '1px 5px', borderRadius: '999px',
                  background: active ? s.color : 'var(--bg-elevated)',
                  color: active ? '#fff' : 'var(--text-muted)', fontWeight: 700,
                }}>{s.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Breadcrumb quando dentro de uma pasta de nicho (ads, organico OU hook) */}
      {((tab === 'ad' && selectedAdNiche) || (tab === 'organico' && selectedOrganicoNiche) || (tab === 'hook' && selectedHookNiche)) && (() => {
        const currentNiche = tab === 'ad' ? selectedAdNiche : tab === 'organico' ? selectedOrganicoNiche : selectedHookNiche
        const clearNiche = tab === 'ad' ? () => setSelectedAdNiche(null) : tab === 'organico' ? () => setSelectedOrganicoNiche(null) : () => setSelectedHookNiche(null)
        const label = tab === 'ad' ? (filteredSwipes.length === 1 ? 'ad' : 'ads') : tab === 'organico' ? (filteredSwipes.length === 1 ? 'vídeo' : 'vídeos') : (filteredSwipes.length === 1 ? 'hook' : 'hooks')
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '13px' }}>
            <button
              onClick={clearNiche}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 10px', borderRadius: '6px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
                fontSize: '12px',
              }}
            >
              ← Nichos
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {currentNiche === '__sem_nicho__' ? 'Sem nicho' : currentNiche}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              ({filteredSwipes.length} {label})
            </span>

            {/* Atribuir nicho em massa — só na pasta "Sem nicho" (onde faz sentido) */}
            {filteredSwipes.length > 0 && currentNiche === '__sem_nicho__' && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {!bulkOpen ? (
                  <button
                    onClick={() => { setBulkOpen(true); setBulkNicheValue(currentNiche === '__sem_nicho__' ? '' : currentNiche) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                      background: 'rgba(255,62,94,0.08)', border: '1px solid rgba(255,62,94,0.25)',
                      color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)',
                    }}
                  >
                    <Tag size={12} /> Atribuir nicho a {filteredSwipes.length}
                  </button>
                ) : (
                  <>
                    <select
                      className="tc-input"
                      value={bulkNicheValue}
                      onChange={(e) => setBulkNicheValue(e.target.value)}
                      disabled={bulkSaving}
                      style={{ fontSize: '12px', padding: '5px 8px', minWidth: '160px' }}
                    >
                      <option value="">Escolha o nicho…</option>
                      {allNichesForBulk.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button
                      onClick={assignNicheToFiltered}
                      disabled={bulkSaving || !bulkNicheValue}
                      className="tc-btn-primary"
                      style={{ fontSize: '12px', padding: '6px 12px', opacity: (bulkSaving || !bulkNicheValue) ? 0.6 : 1 }}
                    >
                      {bulkSaving ? 'Aplicando…' : `Aplicar a ${filteredSwipes.length}`}
                    </button>
                    <button
                      onClick={() => { setBulkOpen(false); setBulkNicheValue('') }}
                      disabled={bulkSaving}
                      style={{ padding: '6px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                    ><X size={13} /></button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Lista */}
      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando...</div>
      ) : (tab === 'ad' && !selectedAdNiche) || (tab === 'organico' && !selectedOrganicoNiche) || (tab === 'hook' && !selectedHookNiche) ? (() => {
        // ── Grade de PASTAS de nicho (ads, orgânicos e hooks) ──
        const groups = tab === 'ad' ? adNicheGroups : tab === 'organico' ? organicoNicheGroups : hookNicheGroups
        const setNiche = tab === 'ad' ? setSelectedAdNiche : tab === 'organico' ? setSelectedOrganicoNiche : setSelectedHookNiche
        const itemLabel = tab === 'ad' ? 'ad' : tab === 'organico' ? 'vídeo' : 'hook'
        const itemsLabel = tab === 'ad' ? 'ads' : tab === 'organico' ? 'vídeos' : 'hooks'
        const emptyMsg = tab === 'ad'
          ? { title: 'Nenhum anúncio ainda', sub: 'Clique em "Subir anúncios" pra começar.' }
          : tab === 'organico'
          ? { title: 'Nenhum vídeo orgânico ainda', sub: 'Salve da página "Vídeos Orgânicos" no botão "Salvar vídeo no Swipe".' }
          : { title: 'Nenhum hook ainda', sub: 'Clique em "Novo hook" ou salve da transcrição de orgânicos.' }
        if (groups.length === 0) {
          return (
            <div style={{
              textAlign: 'center', padding: '48px 24px',
              border: '1px dashed var(--border-default)', borderRadius: '12px',
              color: 'var(--text-muted)',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>{emptyMsg.title}</div>
              <div style={{ fontSize: '12px' }}>{emptyMsg.sub}</div>
            </div>
          )
        }
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px',
          }}>
            {groups.map(g => (
              <button
                key={g.niche}
                onClick={() => setNiche(g.niche)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px',
                  padding: '18px 16px', borderRadius: '12px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: 'rgba(255,62,94,0.1)', color: 'var(--accent)',
                }}>
                  <FolderOpen size={20} />
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                  {g.niche === '__sem_nicho__' ? 'Sem nicho' : g.niche}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{g.count} {g.count === 1 ? itemLabel : itemsLabel}</span>
                  {tab === 'ad' && g.hasVideo > 0 && <span>· {g.hasVideo} 🎬</span>}
                </div>
              </button>
            ))}
          </div>
        )
      })() : filteredSwipes.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          border: '1px dashed var(--border-default)', borderRadius: '12px',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            {search || tagFilter
              ? 'Nenhum resultado pra esses filtros'
              : `Nenhum ${tab === 'hook' ? 'hook' : tab === 'ad' ? 'anúncio' : 'avatar'} ainda`}
          </div>
          <div style={{ fontSize: '12px' }}>
            {!search && !tagFilter && (
              <>
                Use o botão <strong>"Novo"</strong> acima ou salve diretamente das outras páginas.
              </>
            )}
          </div>
        </div>
      ) : (
        <VirtualizedSwipeGrid
          items={filteredSwipes}
          tab={tab}
          minCardWidth={tab === 'ad' ? 360 : 280}
          renderCard={(s) => {
            const props = { swipe: s, onDelete: handleDelete, onEdit: handleEdit, onUseAsReference: handleUseAsReference }
            if (tab === 'hook')     return <HookCard    key={s.id} {...props} onUseHookInCopy={handleUseHookInCopy} onReclassify={handleReclassify} onTagClick={handleTagClick} onStatusChange={handleStatusChange} onOpenEdit={setEditingHook} />
            if (tab === 'ad')       return <AdCard      key={s.id} {...props} onEditAd={setEditingAd} onDetails={setDetailsAd} onTranscribe={handleTranscribeOnly} isAnalyzing={analyzing.some(a => a.swipeId === s.id && a.status === 'running')} />
            if (tab === 'organico') return <OrganicCard key={s.id} {...props} onEditOrganico={setEditingOrganico} onOpenTranscript={setViewingTranscript} />
            return <AvatarCard key={s.id} {...props} onInsertInCopy={setInsertingAvatarInCopy} onEdit={setEditingAvatar} />
          }}
        />
      )}

      {/* Dock flutuante: análises de anúncios rodando em segundo plano */}
      {analyzing.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 900,
          width: '300px', display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          {analyzing.map(a => (
            <div key={a.swipeId} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 14px', borderRadius: '10px',
              background: 'var(--bg-surface)', border: `1px solid ${a.status === 'error' ? 'rgba(255,62,94,0.3)' : 'var(--border-default)'}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}>
              {a.status === 'error'
                ? <X size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                : <Loader2 size={15} style={{ color: '#f59e0b', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                <div style={{ fontSize: '11px', color: a.status === 'error' ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {a.status === 'error' ? (a.error || 'Erro na análise') : 'Analisando vídeo…'}
                </div>
              </div>
              {a.status === 'error' && (
                <button onClick={() => setAnalyzing(prev => prev.filter(x => x.swipeId !== a.swipeId))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, padding: '2px' }}><X size={12} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modais */}
      {showAdd && (
        <AddSwipeModal
          tab={tab}
          onClose={() => setShowAdd(false)}
          onSaved={() => { load(); loadCounts() }}
        />
      )}
      {showImport && (
        <ImportModal
          tab={tab}
          onClose={() => setShowImport(false)}
          onSaved={() => { load(); loadCounts() }}
        />
      )}
      {editingHook && (
        <EditHookModal
          swipe={editingHook}
          allCustomHookTypes={allCustomHookTypes}
          onClose={() => setEditingHook(null)}
          onSaved={(id, newContent) => {
            setSwipes(prev => prev.map(s => s.id === id ? { ...s, content: newContent, _parsed: parseContent(newContent) } : s))
          }}
        />
      )}
      {insertingAvatarInCopy && (
        <InsertAvatarInCopyModal
          swipe={insertingAvatarInCopy}
          onClose={() => setInsertingAvatarInCopy(null)}
        />
      )}
      {editingAvatar && (
        <EditAvatarModal
          swipe={editingAvatar}
          onClose={() => setEditingAvatar(null)}
          onSaved={(id, newContent, newSource) => {
            setSwipes(prev => prev.map(s => s.id === id ? { ...s, content: newContent, source: newSource, _parsed: parseContent(newContent) } : s))
          }}
        />
      )}
      {editingAd && (
        <EditAdModal
          swipe={editingAd}
          onClose={() => setEditingAd(null)}
          onSaved={() => { load(); loadCounts() }}
        />
      )}
      {showUploadAds && (
        <UploadAdsModal
          onClose={() => setShowUploadAds(false)}
          onSaved={() => { load(); loadCounts() }}
        />
      )}
      {detailsAd && (
        <AdDetailsModal
          swipe={detailsAd}
          onClose={() => setDetailsAd(null)}
          onUseAsReference={handleUseAsReference}
          onEdit={async (id, newContent) => {
            await handleEdit(id, newContent)
            setDetailsAd(d => d && d.id === id ? { ...d, content: newContent, _parsed: parseContent(newContent) } : d)
          }}
        />
      )}
      {transcribePending && (
        <TranscribePendingModal
          swipe={transcribePending.swipe}
          navigateAfter={transcribePending.navigateAfter}
          onClose={() => setTranscribePending(null)}
          onUseAnyway={() => { const s = transcribePending.swipe; setTranscribePending(null); goToWriteWithReference(s) }}
          onTranscribed={(updatedSwipe) => {
            const goNext = transcribePending.navigateAfter
            setSwipes(prev => prev.map(s => s.id === updatedSwipe.id ? updatedSwipe : s))
            loadCounts()
            setTranscribePending(null)
            toast.success('Transcrição pronta!')
            if (goNext) goToWriteWithReference(updatedSwipe)
          }}
        />
      )}
      {editingOrganico && (
        <EditOrganicoModal
          swipe={editingOrganico}
          onClose={() => setEditingOrganico(null)}
          onSaved={() => { load(); loadCounts() }}
        />
      )}
      {viewingTranscript && (
        <TranscriptionViewerModal
          swipe={viewingTranscript}
          onClose={() => setViewingTranscript(null)}
          onEdit={handleEdit}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
