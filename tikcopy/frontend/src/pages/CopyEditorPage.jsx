import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Save, X, ChevronRight, ChevronDown, BookOpen, Megaphone, FileText, RefreshCw, User, Download, Check, ListTree, Loader2, Target, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import usePersistedState, { clearPersistedKeys } from '../hooks/usePersistedState'
import { confirmAction, chooseAction } from '../stores/useConfirmStore'
import useEditorGuard from '../stores/useEditorGuard'
import RichEditor from '../components/RichEditor'
import Markdown from '../components/Markdown'
import SuggestionButton from '../components/SuggestionButton'
import ChatPanel from '../components/ChatPanel'
import StructureGuide from '../components/StructureGuide'
import SevenLayers from '../components/SevenLayers'

// Boost (modelo Opus) escondido da UI por ora — toda a engrenagem (estado, backend,
// _pick_model) continua no código. Vira `true` pra reativar quando validar em teste
// cego / virar upsell de um tier premium.
const BOOST_UI_ENABLED = false

// Tipos de memória que viram referência — só transcrição orgânica e de ad
// (engenharia reversa, análises e aulas não entram aqui)
const REFERENCE_TYPES = {
  transcript_ad:      { icon: Megaphone, label: 'Ad',       color: '#ec4899' },
  transcript_organic: { icon: FileText,  label: 'Orgânico', color: '#8b5cf6' },
}

// Filtros disponíveis no painel de referência
const REF_FILTERS = [
  { id: 'organic', label: 'Orgânico',     color: '#8b5cf6', icon: FileText  },
  { id: 'ad',      label: 'Anúncios',     color: '#ec4899', icon: Megaphone },
  { id: 'swipe',   label: 'Minhas Copys',  color: '#06b6d4', icon: BookOpen  },
]

// Converte um draft finalizado de Meus Anúncios em formato de referência
// (mesmo formato de "Bater controle": só hooks validados + body bem formatado)
function formatFinalDraftAsReference(draft) {
  const fd = draft.fields_data || {}
  const raw = (fd.ads_number || '').toString().trim()
  const cleaned = raw ? raw.replace(/^(ads[\s\-_]*|#)/i, '').trim() || raw : ''
  const code = cleaned ? `ADS ${cleaned}` : 'ADS'

  const stripHtml = (html) => {
    if (!html) return ''
    const div = document.createElement('div')
    div.innerHTML = html
    return (div.textContent || '').trim()
  }

  const htmlToParagraphs = (html) => {
    if (!html) return ''
    const normalized = html
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<\/div\s*>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
    const div = document.createElement('div')
    div.innerHTML = normalized
    let text = (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
    const hasBreaks = /\n\n/.test(text)
    if (!hasBreaks && text.length > 280) {
      const matches = text.match(/[^.!?]+[.!?]+(?:["')\]]*)\s*/g) || []
      const consumed = matches.join('')
      const leftover = text.slice(consumed.length).trim()
      const sentences = [...matches.map(s => s.trim())]
      if (leftover) sentences.push(leftover)
      const grouped = []
      for (let i = 0; i < sentences.length; i += 2) {
        grouped.push(sentences.slice(i, i + 2).join(' ').trim())
      }
      text = grouped.filter(Boolean).join('\n\n')
    }
    return text
  }

  const rating = fd.rating || {}
  const hookRatings = rating.hooks || {}
  const allHooks = fd.hooks || []
  const hasAnyRating = Object.keys(hookRatings).length > 0
  const useIdx = allHooks
    .map((_, i) => i)
    .filter(i => hasAnyRating ? hookRatings[i] === 'validado' : true)

  const hooksBlock = useIdx
    .map(i => {
      const txt = stripHtml(allHooks[i])
      if (!txt) return null
      return `**${code}H${i + 1}**: ${txt}`
    })
    .filter(Boolean)
    .join('\n\n')

  const bodyText = htmlToParagraphs(fd.body || '')

  const sections = []
  if (hooksBlock) {
    sections.push(useIdx.length === 1 ? '## HOOK' : '## HOOKS')
    sections.push(hooksBlock)
  }
  if (bodyText) {
    if (hooksBlock) sections.push('---')
    sections.push('## BODY')
    sections.push(bodyText)
  }

  return {
    id: draft.id,
    title: code,
    content: sections.join('\n\n'),
  }
}

// Remove a seção "ENGENHARIA REVERSA" do texto formatado salvo na memória
function stripReverseEngineering(text) {
  if (!text) return ''
  // Aceita variações: "ENGENHARIA REVERSA", "── ENGENHARIA REVERSA", etc.
  const patterns = [
    /\n=+\s*\n(?:──\s*)?ENGENHARIA REVERSA[\s\S]*$/i,
    /\n(?:──\s*)?ENGENHARIA REVERSA[\s\S]*$/i,
    /\n##\s*ENGENHARIA REVERSA[\s\S]*$/i,
  ]
  let result = text
  for (const re of patterns) {
    result = result.replace(re, '')
  }
  return result.trim()
}

const field = (label, key, placeholder, type = 'input') => ({ label, key, placeholder, type })

const META_FIELDS = [
  field('Nº do ADS', 'ads_number', 'Ex: ADS-001, #42...'),
  field('Ângulo', 'angle', 'Ex: Dor, Curiosidade, Prova social...'),
  field('Formato', 'format', 'Ex: VSL, Talking head, UGC, Carrossel...'),
  field('Avatar', 'avatar', 'Ex: Mulher 30-45, empreendedora, ansiosa...', 'textarea'),
  field('Instruções de Edição', 'editing_notes', 'Ex: Corte rápido, legendas animadas, trilha energética...', 'textarea'),
  field('Vídeo Referência', 'video_ref', 'https://...'),
]

// Briefing de criação do ADS — 3 grupos
const BRIEFING_GROUPS = [
  {
    title: 'New idea',
    fields: [
      { key: 'angle_why',     label: 'Qual será o ângulo principal do meu anúncio? Por quê?',                        placeholder: 'Ex: Vou usar o ângulo de dor porque o avatar está saturado de promessas vazias...' },
      { key: 'new_idea',      label: 'Qual será minha new idea? O que irei fazer neste anúncio? Por quê?',           placeholder: 'Ex: Vou abrir contando uma história inesperada de fracasso médico que vira virada...' },
    ],
  },
  {
    title: 'Produção',
    fields: [
      { key: 'avatar_why',    label: 'Qual avatar irei usar neste anúncio? Por quê?',                                placeholder: 'Ex: Vou usar mulher 30-45 porque é o perfil que mais converte historicamente...' },
      { key: 'format_why',    label: 'Qual formato irei usar neste anúncio? Por quê?',                               placeholder: 'Ex: Vou usar UGC frente à câmera porque está validado no controle atual...' },
      { key: 'headline',      label: 'Irei usar headline neste anúncio? Se sim, qual?',                              placeholder: 'Ex: Sim, "O médico não quer que você saiba disso"' },
      { key: 'editing_style', label: 'Qual estilo de edição e trilha sonora usarei? (Se tiver referência, deixe aqui)', placeholder: 'Ex: Cortes rápidos, legendas animadas, trilha tipo cinematográfica. Ref: https://...' },
    ],
  },
  {
    title: 'Comunicação',
    fields: [
      { key: 'organic_base',  label: 'Qual anúncio/vídeo do orgânico validado eu irei usar como base? Cole a transcrição abaixo.', placeholder: 'Cole o link e a transcrição do orgânico validado...', long: true },
    ],
  },
]

const EMPTY_BRIEFING = BRIEFING_GROUPS
  .flatMap(g => g.fields.map(f => f.key))
  .reduce((acc, k) => ({ ...acc, [k]: '' }), {})

function MetaField({ label, value, onChange, type, headerAction }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
        <label className="tc-label" style={{ margin: 0 }}>{label}</label>
        {headerAction}
      </div>
      {type === 'textarea' ? (
        <textarea className="tc-input tc-textarea" value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ resize: 'vertical', fontSize: '13px' }} />
      ) : (
        <input className="tc-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: '13px' }} />
      )}
    </div>
  )
}

// ─── Modal: Importar avatar do Swipe File ────────────────────────────────────

function ImportAvatarModal({ onClose, onPick }) {
  const [avatars, setAvatars] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/swipes?tag=avatar')
      .then(res => setAvatars(res.data || []))
      .catch(() => setAvatars([]))
      .finally(() => setLoading(false))
  }, [])

  const parseDesc = (swipe) => {
    try {
      const c = typeof swipe.content === 'string' ? JSON.parse(swipe.content) : swipe.content
      const a = c.avatar || c
      return a.description || a.descricao || [a.genero, a.idade_aparente, a.energia].filter(Boolean).join(' · ') || ''
    } catch { return '' }
  }

  const parseLink = (swipe) => {
    try {
      const c = typeof swipe.content === 'string' ? JSON.parse(swipe.content) : swipe.content
      return c.source_video_url || swipe.source || ''
    } catch { return swipe.source || '' }
  }

  const filtered = avatars.filter(a => {
    if (!search.trim()) return true
    return parseDesc(a).toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '20px', maxWidth: '560px', width: '100%',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Importar avatar do Swipe</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Clique num avatar pra usar a descrição
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <input
          className="tc-input"
          placeholder="Buscar avatar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: '13px', marginBottom: '12px' }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>
              {search ? 'Nada encontrado.' : 'Nenhum avatar no Swipe ainda. Salve avatares na aba Swipe → Avatares.'}
            </div>
          ) : filtered.map((a) => {
            const desc = parseDesc(a)
            const link = parseLink(a)
            return (
              <button
                key={a.id}
                onClick={() => { onPick(desc, link); onClose() }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px 14px', borderRadius: '8px', textAlign: 'left',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
              >
                <User size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {desc || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Sem descrição</span>}
                  </div>
                  {link && (
                    <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🔗 {link}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Importar ad do Swipe File ────────────────────────────────────────

function ImportAdRefModal({ onClose, onPick }) {
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fetchingId, setFetchingId] = useState(null)
  const [kindTab, setKindTab] = useState('ad')   // 'ad' | 'organico'

  useEffect(() => {
    Promise.all([
      api.get('/swipes?tag=ad').then(r => (r.data || []).map(s => ({ ...s, _kind: 'ad' }))).catch(() => []),
      api.get('/swipes?tag=organico').then(r => (r.data || []).map(s => ({ ...s, _kind: 'organico' }))).catch(() => []),
    ])
      .then(([adsList, orgList]) => setAds([...adsList, ...orgList]))
      .finally(() => setLoading(false))
  }, [])

  const parse = (swipe) => {
    try {
      const c = typeof swipe.content === 'string' ? JSON.parse(swipe.content) : swipe.content
      return {
        title: c.title || 'Sem título',
        niche: c.niche,
        format: c.format,
        hook: c.hook_written || c.hook || '',
        url: c.source_video_url || swipe.source || '',
        hasVideo: !!(c.video || c.has_video || c.source_video_url),
        kind: swipe._kind || 'ad',
      }
    } catch { return { title: 'Sem título', kind: swipe._kind || 'ad' } }
  }

  const counts = {
    ad: ads.filter(a => (a._kind || 'ad') === 'ad').length,
    organico: ads.filter(a => a._kind === 'organico').length,
  }
  const filtered = ads.filter(a => {
    if ((a._kind || 'ad') !== kindTab) return false
    if (!search.trim()) return true
    const p = parse(a)
    return [p.title, p.niche, p.format, p.hook].some(v => (v || '').toLowerCase().includes(search.toLowerCase()))
  })

  const handlePick = async (swipe) => {
    const p = parse(swipe)
    // 1ª prioridade: URL externa (source do swipe ou source_video_url do conteúdo)
    const link = swipe.source || p.url
    if (link) {
      onPick(link)
      onClose()
      return
    }
    // 2ª prioridade: vídeo no Swipe → busca URL de playback temporária
    if (p.hasVideo) {
      setFetchingId(swipe.id)
      try {
        const res = await api.get(`/videos/playback/${swipe.id}`)
        onPick(res.data.url)
        onClose()
      } catch {
        toast.error('Não foi possível gerar o link do vídeo')
      } finally { setFetchingId(null) }
      return
    }
    toast.error('Esse swipe não tem link nem vídeo')
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '20px', maxWidth: '600px', width: '100%',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Importar do Swipe</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Clique num anúncio ou orgânico pra usar o link como referência de vídeo
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        {/* Abas de tipo */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          {[
            { id: 'ad', label: '📣 Anúncios', count: counts.ad },
            { id: 'organico', label: '🎥 Orgânico', count: counts.organico },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setKindTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                background: kindTab === t.id ? 'var(--bg-elevated)' : 'transparent',
                border: `1px solid ${kindTab === t.id ? 'var(--border-default)' : 'transparent'}`,
                color: kindTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {t.label}
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: 'var(--bg-active)', color: 'var(--text-muted)' }}>{t.count}</span>
            </button>
          ))}
        </div>

        <input
          className="tc-input"
          placeholder="Buscar por título, nicho, formato ou hook…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: '13px', marginBottom: '12px' }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>
              {search ? 'Nada encontrado.' : kindTab === 'organico' ? 'Nenhum orgânico no Swipe ainda.' : 'Nenhum anúncio no Swipe ainda.'}
            </div>
          ) : filtered.map((a) => {
            const p = parse(a)
            const isBusy = fetchingId === a.id
            return (
              <button
                key={a.id}
                onClick={() => handlePick(a)}
                disabled={isBusy}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px 14px', borderRadius: '8px', textAlign: 'left',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  cursor: isBusy ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                  opacity: isBusy ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (!isBusy) e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
              >
                {p.kind === 'organico'
                  ? <FileText size={14} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: '2px' }} />
                  : <Megaphone size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {p.title}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    {p.niche && <span>📂 {p.niche}</span>}
                    {p.format && <span>🎬 {p.format}</span>}
                    {p.hasVideo && <span style={{ color: '#22c55e' }}>• tem vídeo</span>}
                    {a.source && <span style={{ color: 'var(--accent)' }}>• tem link</span>}
                  </div>
                  {p.hook && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                      "{p.hook}"
                    </div>
                  )}
                </div>
                {isBusy && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Gerando link…</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Section: wrapper com header colapsável ──────────────────────────────────

function Section({ title, defaultOpen = true, headerAction, children, open: controlledOpen, onOpenChange }) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v) => {
    const next = typeof v === 'function' ? v(open) : v
    if (isControlled) onOpenChange?.(next)
    else setUncontrolledOpen(next)
  }
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '10px', marginBottom: '12px', overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {open ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            {title}
          </span>
        </div>
        {headerAction && <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>}
      </div>
      {open && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function HookBox({ index, onChange, onRemove, canRemove, initialContent, suggestButton, currentText }) {
  const editorRef = useRef(null)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}>
        <label className="tc-label" style={{ margin: 0 }}>
          Hook {index > 0 ? `#${index + 1}` : ''}
        </label>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {suggestButton}
          {canRemove && (
            <button onClick={onRemove} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <RichEditor ref={editorRef} onChange={onChange} placeholder="Escreva o hook aqui..." initialContent={initialContent} />
    </div>
  )
}

// ─── Painel de Referência ────────────────────────────────────────────────────

// Renderiza a referência ativa com a ESTRUTURA INVISÍVEL acima de cada parágrafo.
function LabeledReference({ structureGuide }) {
  const chip = (text) => (
    <div style={{
      display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em',
      color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)',
      borderRadius: '5px', padding: '2px 8px', marginBottom: '5px',
    }}>{text}</div>
  )
  const para = { fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '14px', whiteSpace: 'pre-wrap' }

  return (
    <div>
      {structureGuide.hook_text && (
        <div style={{ marginBottom: '4px' }}>
          {chip('🎣 Gancho')}
          <div style={para}>{structureGuide.hook_text}</div>
        </div>
      )}
      {(structureGuide.body || []).map((s, i) => (
        <div key={i}>
          {chip(`${i + 1}. ${s.label || 'Bloco'}`)}
          <div style={para}>{s.text || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{s.purpose}</span>}</div>
        </div>
      ))}
    </div>
  )
}

function ReferencePanel({ memoryItems, finalDrafts, selected, onSelect, onClear, onRefresh, refreshing, structureGuide, organicBase }) {
  const [filter, setFilter] = useState('organic')
  const [nicheFilter, setNicheFilter] = useState('')   // '' = todos os nichos
  const hasStructure = !!(structureGuide && (structureGuide.body || []).length > 0)

  const nicheOf = (item) => (item.metadata?.niche || item.niche || '').trim()

  // Lista por TIPO (antes do filtro de nicho)
  const baseList = (() => {
    if (filter === 'organic') return memoryItems.filter(i => i.type === 'transcript_organic')
    if (filter === 'ad')      return memoryItems.filter(i => i.type === 'transcript_ad')
    return finalDrafts                                              // swipe → Minhas Copys finalizadas
  })()

  // Nichos disponíveis na aba atual (pra popular o seletor)
  const nichesAvailable = useMemo(() => {
    const set = new Set()
    baseList.forEach(i => { const n = nicheOf(i); if (n) set.add(n) })
    return [...set].sort()
  }, [baseList])

  // Aplica o filtro de nicho (só vale onde faz sentido)
  const list = (filter !== 'swipe' && nicheFilter)
    ? baseList.filter(i => nicheOf(i) === nicheFilter)
    : baseList

  const counts = {
    organic: memoryItems.filter(i => i.type === 'transcript_organic').length,
    ad:      memoryItems.filter(i => i.type === 'transcript_ad').length,
    swipe:   finalDrafts.length,
  }

  // ── Quando há referência selecionada: layout "Referência ativa" (limpo, sem filtros) ──
  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#06b6d4' }}>📌 Referência ativa</div>
          <button
            onClick={onClear}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px 8px', borderRadius: '4px',
              fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px',
            }}
          >
            <X size={11} /> Trocar
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
            {selected.metadata?.title || selected.title || 'Sem título'}
          </div>
          {hasStructure
            ? <LabeledReference structureGuide={structureGuide} />
            : <Markdown>{selected.content}</Markdown>}
        </div>
      </div>
    )
  }

  // ── Sem seleção: mostra filtros + dropdown pra escolher ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            📖 Referência
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Atualizar lista (busca novas transcrições do projeto)"
              style={{
                background: 'transparent', border: 'none',
                cursor: refreshing ? 'wait' : 'pointer',
                color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px',
                display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px',
              }}
            >
              <RefreshCw
                size={11}
                style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}
              />
            </button>
          )}
        </div>

        {/* Filtros de tipo */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {REF_FILTERS.map(({ id, label, color, icon: Icon }) => {
            const active = filter === id
            return (
              <button
                key={id}
                onClick={() => { setFilter(id); setNicheFilter('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 9px', borderRadius: '999px', fontSize: '10px',
                  background: active ? `${color}20` : 'transparent',
                  border: `1px solid ${active ? color : 'var(--border-default)'}`,
                  color: active ? color : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                <Icon size={10} /> {label}
                <span style={{
                  fontSize: '9px', padding: '0 5px', borderRadius: '999px',
                  background: active ? color : 'var(--bg-elevated)',
                  color: active ? '#fff' : 'var(--text-muted)', fontWeight: 700,
                }}>{counts[id]}</span>
              </button>
            )
          })}
        </div>

        {/* Filtro por nicho (só Orgânico/Anúncios, quando há nichos) */}
        {filter !== 'swipe' && nichesAvailable.length > 0 && (
          <select
            value={nicheFilter}
            onChange={(e) => setNicheFilter(e.target.value)}
            className="tc-input"
            style={{ width: '100%', fontSize: '11px', padding: '6px 8px', marginBottom: '6px' }}
          >
            <option value="">🏷️ Todos os nichos</option>
            {nichesAvailable.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        <select
          value=""
          onChange={(e) => {
            const id = e.target.value
            if (!id) return
            const found = list.find(x => String(x.id) === id)
            if (found) onSelect({ ...found, _kind: filter })
          }}
          className="tc-input"
          style={{ width: '100%', fontSize: '11px', padding: '6px 8px' }}
        >
          <option value="">
            {filter === 'swipe' ? 'Escolha um ad finalizado' : 'Escolha uma transcrição'}
          </option>
          {list.length === 0 && <option disabled>Nada salvo ainda</option>}
          {list.map(item => {
            const title = filter === 'swipe' ? (item.title || 'Sem título') : (item.metadata?.title || 'Sem título')
            return (
              <option key={item.id} value={item.id}>
                {title}
              </option>
            )
          })}
        </select>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {organicBase && organicBase.trim() ? (
          <>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>
              🎬 Vídeo da Comunicação
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {organicBase}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', lineHeight: 1.6 }}>
            Escolha uma referência acima,<br />ou preencha a Comunicação no Briefing<br />pra ler o vídeo aqui enquanto escreve.
          </div>
        )}
      </div>
    </div>
  )
}

// Constrói markdown unificado a partir do content parseado de um swipe orgânico.
// Hook vira "## Hook", body vira "## Body". Se só houver transcript_full, usa ele.
function buildSwipeOrganicMarkdown(c) {
  const hook = (c.hook || c.hook_written || '').trim()
  const body = (c.body || '').trim()
  const transcript = (c.transcript_full || c.transcript || '').trim()
  if (hook && body) {
    return `## Hook\n\n${hook}\n\n## Body\n\n${body}`
  }
  // Se só tem um dos dois, usa esse com heading
  if (hook && !body) return `## Hook\n\n${hook}${transcript ? `\n\n## Body\n\n${transcript}` : ''}`
  if (body && !hook) return body
  return transcript || hook || body || ''
}

// ─── RightPanel: alterna entre Chat IA (modo Híbrido) e Referência ────────

function RightPanel({ writeMode, memoryItems, finalDrafts, selectedRef, setSelectedRef, loadAllMemory, refLoading, buildAIContext, chatKey, structureGuide, organicBase }) {
  const [tab, setTab] = usePersistedState('copyEditor:rightTab', writeMode === 'hibrido' ? 'chat' : 'ref')

  // Conceito do Brainstorm está ocupando a referência? Ganha aba própria.
  const hasBrainstorm = selectedRef?.metadata?.source === 'brainstorm'
  // O seletor de anúncio não enxerga o conceito do brainstorm (ele vive na aba dele).
  const swipeSelected = hasBrainstorm ? null : selectedRef
  // Anúncio do swipe com as 7 camadas salvas → ganha aba própria pra consulta.
  const refLayers = (!hasBrainstorm && selectedRef?.metadata?.seven_layers) || null
  const hasRefLayers = !!refLayers

  // Volta pra Referência se a aba ativa deixou de existir.
  useEffect(() => {
    if (writeMode !== 'hibrido' && tab === 'chat') setTab('ref')
  }, [writeMode]) // eslint-disable-line
  useEffect(() => {
    if (!hasBrainstorm && tab === 'brainstorm') setTab('ref')
    if (!hasRefLayers && tab === '7camadas') setTab('ref')
  }, [hasBrainstorm, hasRefLayers]) // eslint-disable-line

  const showTabs = writeMode === 'hibrido' || hasBrainstorm || hasRefLayers
  const TabBtn = ({ id, label, color }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1, padding: '10px 12px', fontSize: '12px', fontWeight: 600,
        background: tab === id ? 'var(--bg-surface)' : 'transparent',
        color: tab === id ? color : 'var(--text-muted)',
        border: 'none', borderBottom: `2px solid ${tab === id ? color : 'transparent'}`,
        cursor: 'pointer', fontFamily: 'var(--font)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showTabs && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0, background: 'var(--bg-elevated)' }}>
          {writeMode === 'hibrido' && <TabBtn id="chat" label="✨ Chat IA" color="#8b5cf6" />}
          <TabBtn id="ref" label="📖 Referência" color="var(--accent)" />
          {hasRefLayers && <TabBtn id="7camadas" label="✦ 7 Camadas" color="#f43f5e" />}
          {hasBrainstorm && <TabBtn id="brainstorm" label="✦ Brainstorm" color="#f43f5e" />}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'chat' && writeMode === 'hibrido' ? (
          <ChatPanel buildContext={buildAIContext} chatKey={chatKey} />
        ) : tab === 'brainstorm' && hasBrainstorm ? (
          <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#f43f5e', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                ✦ Conceito do Brainstorm
              </div>
              <button
                onClick={() => setSelectedRef(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <X size={11} /> Remover
              </button>
            </div>
            <Markdown>{selectedRef.content}</Markdown>
          </div>
        ) : tab === '7camadas' && hasRefLayers ? (
          <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
              As 7 camadas macro do anúncio de referência. Use de guia pra modelar a estrutura.
            </div>
            <SevenLayers data={refLayers} />
          </div>
        ) : (
          <ReferencePanel
            memoryItems={memoryItems}
            finalDrafts={finalDrafts}
            selected={swipeSelected}
            onSelect={setSelectedRef}
            onClear={() => setSelectedRef(null)}
            onRefresh={loadAllMemory}
            refreshing={refLoading}
            structureGuide={structureGuide}
            organicBase={organicBase}
          />
        )}
      </div>
    </div>
  )
}

// ─── Modal: escolher swipe orgânico pra usar como base de comunicação ─────

function OrganicSwipePickerModal({ onClose, onPick }) {
  const [swipes, setSwipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kindTab, setKindTab] = useState('organico')   // 'organico' | 'ad'

  useEffect(() => {
    Promise.all([
      api.get('/swipes?tag=organico').then(r => (r.data || []).map(s => ({ ...s, _kind: 'organico' }))).catch(() => []),
      api.get('/swipes?tag=ad').then(r => (r.data || []).map(s => ({ ...s, _kind: 'ad' }))).catch(() => []),
    ])
      .then(([orgs, ads]) => setSwipes([...orgs, ...ads]))
      .catch(() => toast.error('Erro ao carregar swipes'))
      .finally(() => setLoading(false))
  }, [])

  // Parsing + filtragem (por aba de tipo + busca)
  const items = useMemo(() => {
    const parsed = swipes.filter(s => (s._kind || 'organico') === kindTab).map(s => {
      let c = {}
      try { c = typeof s.content === 'string' ? JSON.parse(s.content) : (s.content || {}) }
      catch {}
      return {
        id: s.id,
        title: c.title || 'Sem título',
        niche: c.niche || '',
        format: c.format || '',
        url: c.source_video_url || s.source || '',
        kind: s._kind || 'organico',
        // Markdown formatado igual ao do swipe (## Hook + ## Body) — funciona pra ad e orgânico
        formattedContent: buildSwipeOrganicMarkdown(c),
        // Texto puro só pra preview na lista do modal
        previewText: (c.transcript_full || c.transcript || c.body || c.hook_written || c.hook || ''),
        createdAt: s.created_at,
      }
    })
    if (!search.trim()) return parsed
    const needle = search.toLowerCase()
    return parsed.filter(p =>
      p.title.toLowerCase().includes(needle) ||
      p.niche.toLowerCase().includes(needle) ||
      p.previewText.toLowerCase().includes(needle)
    )
  }, [swipes, search, kindTab])

  const counts = useMemo(() => ({
    organico: swipes.filter(s => (s._kind || 'organico') === 'organico').length,
    ad: swipes.filter(s => s._kind === 'ad').length,
  }), [swipes])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '12px', width: '100%', maxWidth: '720px', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Importar do Swipe
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Escolha um orgânico ou anúncio validado pra usar como base de comunicação.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '4px',
          }}><X size={18} /></button>
        </div>

        {/* Abas de tipo */}
        <div style={{ display: 'flex', gap: '6px', padding: '12px 22px 0' }}>
          {[
            { id: 'organico', label: '🎥 Orgânico', count: counts.organico },
            { id: 'ad', label: '📣 Anúncios', count: counts.ad },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setKindTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px 8px 0 0', fontSize: '12px', fontWeight: 600,
                background: kindTab === t.id ? 'var(--bg-elevated)' : 'transparent',
                border: '1px solid', borderColor: kindTab === t.id ? 'var(--border-default)' : 'transparent',
                borderBottom: 'none', color: kindTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {t.label}
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: 'var(--bg-active)', color: 'var(--text-muted)' }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Busca */}
        <div style={{ padding: '10px 22px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            className="tc-input"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, nicho ou conteúdo…"
            style={{ width: '100%', fontSize: '13px' }}
          />
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px' }}>
          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              Carregando…
            </div>
          ) : items.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', lineHeight: 1.6 }}>
              {search.trim()
                ? 'Nada encontrado pra essa busca.'
                : kindTab === 'ad'
                  ? <>Nenhum anúncio no Swipe ainda.<br />Salve pelo <strong>Swipe File → Anúncios</strong>.</>
                  : <>Nenhum orgânico no Swipe ainda.<br />Salve pelo <strong>Swipe File → Orgânicos</strong>.</>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onPick(item)}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: '8px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                    cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text-primary)',
                    transition: 'border-color 0.15s, transform 0.05s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.title}</div>
                    {item.niche && (
                      <span style={{
                        fontSize: '10px', padding: '2px 7px', borderRadius: '999px',
                        background: 'rgba(255,62,94,0.08)', color: 'var(--accent)',
                      }}>{item.niche}</span>
                    )}
                  </div>
                  {item.previewText && (
                    <div style={{
                      fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {item.previewText.slice(0, 200)}
                    </div>
                  )}
                  {item.url && (
                    <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '4px', wordBreak: 'break-all' }}>
                      {item.url}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────

export default function CopyEditorPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const editingId = searchParams.get('id')

  const emptyMeta = () => ({
    ads_number: '', angle: '', format: '', avatar: '',
    editing_notes: '', video_ref: '',
  })

  // Persistência: chave depende se tá editando draft existente ou novo
  // Sobrevive a trocar de aba (Escrever ↔ Transcrever ↔ Swipe etc.) E refresh do browser.
  const persistKey = editingId ? `copyEditor:edit:${editingId}` : 'copyEditor:new'
  const [meta, setMeta] = usePersistedState(`${persistKey}:meta`, emptyMeta())
  const [briefing, setBriefing] = usePersistedState(`${persistKey}:briefing`, { ...EMPTY_BRIEFING })
  const [hooks, setHooks] = usePersistedState(`${persistKey}:hooks`, [{ id: Date.now(), html: '' }])
  const [body, setBody] = usePersistedState(`${persistKey}:body`, '')
  const [bodyComments, setBodyComments] = usePersistedState(`${persistKey}:bodyComments`, [])
  // bodyInitial: usado pelo RichEditor SÓ no mount (componente uncontrolled).
  // Por isso inicializamos com o body persistido — assim na remontagem (volta da outra aba)
  // o editor já aparece preenchido.
  const [bodyInitial, setBodyInitial] = useState(body)
  // Versão pra forçar remount do RichEditor (ao clicar "Novo")
  const [editorVersion, setEditorVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loadedDraft, setLoadedDraft] = useState(null) // draft completo quando editando
  const [loadingDraft, setLoadingDraft] = useState(false)
  // Snapshot do que já está SALVO (no backend). Usado pra detectar edições não salvas.
  const savedSnapRef = useRef(null)
  const [aiOpen, setAiOpen] = useState(true)
  const [showAvatarImport, setShowAvatarImport] = useState(false)
  const [showAdRefImport, setShowAdRefImport] = useState(false)
  const [hooksOpen, setHooksOpen] = useState(false)
  const [showOrganicSwipePicker, setShowOrganicSwipePicker] = useState(false)

  // Modo de escrita: manual | hibrido | auto. Persiste entre sessões.
  const [writeMode, setWriteMode] = usePersistedState('copyEditor:mode', 'manual')
  const [boostOn, setBoostOn] = usePersistedState('copyEditor:boost', false)

  // Helper: extrai texto puro de HTML (usado em vários pontos do render)
  const stripHtml = (html) => {
    if (!html) return ''
    const div = document.createElement('div')
    div.innerHTML = html
    return (div.textContent || '').trim()
  }

  // ── (Manual) Estrutura invisível importada da Comunicação ──
  // Guia editável (esqueleto psicológico) que orienta hook + body, com toggle 👁️.
  const [structureGuide, setStructureGuide] = usePersistedState(`${persistKey}:structure`, { hook: '', hook_text: '', body: [] })
  const [guideVisible, setGuideVisible] = usePersistedState(`${persistKey}:structureVisible`, true)
  const [loadingStructure, setLoadingStructure] = useState(false)
  const hasGuide = !!(structureGuide?.hook || (structureGuide?.body || []).length)

  const importStructure = async () => {
    const organicBase = stripHtml(briefing?.organic_base || '')
    if (!organicBase) {
      toast.error('Preencha a COMUNICAÇÃO no Briefing primeiro (transcrição do orgânico validado).')
      return
    }
    setLoadingStructure(true)
    try {
      const res = await api.post('/ai/extract-structure', {
        project_id: activeProject?.id || null,
        organic_base: briefing.organic_base,
      })
      setStructureGuide({ hook: res.data.hook || '', hook_text: res.data.hook_text || '', body: res.data.body || [] })
      setGuideVisible(true)
      toast.success('Estrutura invisível importada. Use como guia ao escrever.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao importar estrutura')
    } finally {
      setLoadingStructure(false)
    }
  }

  // ── Inserir / remover os marcadores [label] da estrutura no body ──
  const bodyHasStructure = hasGuide && (structureGuide.body || []).length > 0 &&
    structureGuide.body.every(s => stripHtml(body).includes(`[${s.label}]`))

  const insertStructureIntoBody = async () => {
    const steps = structureGuide.body || []
    if (!steps.length) return
    const scaffold = steps.map(s => `<p><strong>[${s.label}]</strong></p><p></p>`).join('')
    const hasContent = stripHtml(body).trim().length > 0
    let next = scaffold
    if (hasContent) {
      const ok = await confirmAction({
        title: 'Inserir estrutura no body?',
        message: 'Os marcadores [bloco] vão ser adicionados no início do body. O que já está escrito é mantido abaixo.',
        confirmLabel: 'Inserir',
      })
      if (!ok) return
      next = scaffold + body
    }
    setBody(next); setBodyInitial(next); setEditorVersion(v => v + 1)
  }

  const removeStructureFromBody = () => {
    const div = document.createElement('div')
    div.innerHTML = body || ''
    const markers = new Set((structureGuide.body || []).map(s => `[${s.label}]`.trim().toLowerCase()))
    div.querySelectorAll('p').forEach(p => {
      const t = (p.textContent || '').trim().toLowerCase()
      if (markers.has(t)) p.remove()
    })
    const html = div.innerHTML
    setBody(html); setBodyInitial(html); setEditorVersion(v => v + 1)
  }

  // Constrói o pacote de contexto que vai pros endpoints de IA
  const buildAIContext = () => ({
    project_id: activeProject?.id || null,
    briefing,
    meta,
    current_hooks: (hooks || []).map(h => stripHtml(h.html || '')).filter(Boolean),
    current_body: stripHtml(body || ''),
    // Referência selecionada no painel. Tipo define o papel na IA:
    //  - 'concept' (conceito do Brainstorm) → reposicionamento estratégico
    //  - 'ad' (anúncio do Swipe) → molde de execução a modelar
    reference: selectedRef ? {
      kind: selectedRef.metadata?.source === 'brainstorm' ? 'concept' : 'ad',
      title: selectedRef.metadata?.title || selectedRef.title || null,
      niche: selectedRef.metadata?.niche || null,
      content: selectedRef.content || '',
    } : null,
    // Boost (Opus) só pode ir ligado se a UI do Boost estiver habilitada. Sem isso,
    // um valor `true` antigo salvo no localStorage usaria Opus sem o usuário saber.
    boost: BOOST_UI_ENABLED && boostOn,
  })

  // (C) Melhorar trecho selecionado do body com IA
  const improveSelection = async (text, instruction) => {
    try {
      const res = await api.post('/ai/improve-selection', {
        selection: text,
        instruction: instruction || null,
        ...buildAIContext(),
      })
      return res.data.suggestions || []
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao melhorar trecho')
      return []
    }
  }


  // Referências do projeto (transcrições orgânicas + ads)
  const [allMemory, setAllMemory] = useState([])
  const [refLoading, setRefLoading] = useState(false)
  const [selectedRef, setSelectedRef] = usePersistedState(`${persistKey}:selectedRef`, null)   // persiste ao sair/voltar

  // Ao selecionar uma referência: se for "Minhas Copys" (rascunho finalizado),
  // a lista /drafts vem "lite" (sem o body em HTML). Busca o draft completo
  // pra remontar a referência com o BODY antes de exibir.
  const selectRef = async (item) => {
    if (!item) { setSelectedRef(null); return }
    if (item._kind === 'swipe' && item.id) {
      try {
        const res = await api.get(`/drafts/${item.id}`)
        const full = formatFinalDraftAsReference(res.data)
        setSelectedRef({ ...full, _kind: 'swipe' })
        return
      } catch { /* fallback: usa o item lite que já tem os hooks */ }
    }
    setSelectedRef(item)
  }

  // Carrega memória do projeto (extraído num callback pra ser chamado
  // tanto no mount quanto pelo botão Refresh do painel)
  const loadAllMemory = () => {
    if (!activeProject?.id) { setAllMemory([]); setSelectedRef(null); return Promise.resolve() }
    setRefLoading(true)
    return api.get(`/intelligence/${activeProject.id}/documents`)
      .then(res => setAllMemory(res.data || []))
      .catch(() => setAllMemory([]))
      .finally(() => setRefLoading(false))
  }
  useEffect(() => { loadAllMemory() }, [activeProject?.id]) // eslint-disable-line

  // Carrega o SWIPE FILE (orgânicos + anúncios) — fonte ÚNICA das referências.
  const [swipeRefs, setSwipeRefs] = useState([])
  const loadSwipeRefs = () => {
    const parse = (s) => { try { return typeof s.content === 'string' ? JSON.parse(s.content) : (s.content || {}) } catch { return {} } }
    return Promise.all([
      api.get('/swipes?tag=organico').then(r => r.data || []).catch(() => []),
      api.get('/swipes?tag=ad').then(r => r.data || []).catch(() => []),
    ]).then(([orgs, ads]) => {
      const mapOrg = orgs.map(s => {
        const c = parse(s)
        const content = (c.transcript_full || c.transcript || c.body || c.hook || '').trim()
        return {
          id: `swipe-${s.id}`, type: 'transcript_organic',
          title: c.title || 'Orgânico (swipe)',
          // não descarta sem conteúdo — mostra ao menos o título na lista
          content: content || '(orgânico sem transcrição salva)',
          metadata: { title: c.title, source: 'swipe', niche: c.niche },
        }
      })
      const mapAd = ads.map(s => {
        const c = parse(s)
        const parts = []
        if (c.hook_written) parts.push(`## Hook\n\n${c.hook_written}`)
        if (c.hook_visual)  parts.push(`## Hook visual\n\n${c.hook_visual}`)
        if (c.landing_phrase) parts.push(`## Aterrissagem\n\n${c.landing_phrase}`)
        if (c.body) parts.push(`## Body\n\n${c.body}`)
        const fallback = (c.transcript_full || c.transcript || c.hook || c.observations || '').trim()
        const content = parts.join('\n\n').trim() || fallback
        return {
          id: `swipe-${s.id}`, type: 'transcript_ad',
          title: c.title || 'Anúncio (swipe)',
          // mesmo sem conteúdo rico, mantém (mostra ao menos o título) — não some da lista
          content: content || `(anúncio sem texto salvo)`,
          metadata: { title: c.title, source: 'swipe', niche: c.niche, seven_layers: c.seven_layers || null },
        }
      })
      setSwipeRefs([...mapOrg, ...mapAd])
    })
  }
  useEffect(() => { loadSwipeRefs() }, []) // eslint-disable-line

  // Referências = SOMENTE itens do Swipe File (fonte única).
  // Ao excluir um anúncio/orgânico do Swipe, ele some daqui automaticamente.
  const referenceItems = useMemo(() => [...swipeRefs], [swipeRefs])

  // Carrega drafts finalizados (Meus Anúncios) pra serem usados como swipe de referência
  const [finalDrafts, setFinalDrafts] = useState([])
  useEffect(() => {
    api.get('/drafts')
      .then(res => {
        const all = res.data || []
        const finals = all
          .filter(d => {
            const fd = d.fields_data || {}
            const isManual = !fd.source_type || fd.source_type === 'manual'
            return isManual && fd.status === 'final'
          })
          .map(d => formatFinalDraftAsReference(d))
        setFinalDrafts(finals)
      })
      .catch(() => setFinalDrafts([]))
  }, [])

  // ── Carrega draft existente quando vem com ?id=XXX da página Meus Anúncios ──
  // IMPORTANTE: só HIDRATA os campos (body/hooks/meta) a partir do backend na PRIMEIRA
  // vez que abre o draft (quando não há estado local salvo). Se você já estava editando
  // e voltou de outra aba, o estado vem do localStorage — NÃO sobrescrevemos, senão as
  // edições não salvas eram perdidas (bug do "rollback" pro salvamento inicial).
  const hydratedRef = useRef(null)
  useEffect(() => {
    if (!editingId) return
    const hasLocalEdits =
      localStorage.getItem(`${persistKey}:body`) !== null ||
      localStorage.getItem(`${persistKey}:hooks`) !== null ||
      localStorage.getItem(`${persistKey}:meta`) !== null
    setLoadingDraft(true)
    api.get(`/drafts/${editingId}`)
      .then((res) => {
        const d = res.data
        const fd = d.fields_data || {}
        setLoadedDraft(d)   // sempre atualiza a metadata (rating, badge final/rascunho)

        // Só carrega os campos do backend se NÃO houver edição local em andamento
        if (!hasLocalEdits && hydratedRef.current !== editingId) {
          hydratedRef.current = editingId
          setMeta({
            ads_number: fd.ads_number || '',
            angle: fd.angle || '',
            format: fd.format || '',
            avatar: fd.avatar || '',
            editing_notes: fd.editing_notes || '',
            video_ref: fd.video_ref || '',
          })
          setBriefing({ ...EMPTY_BRIEFING, ...(fd.briefing || {}) })
          const loadedHooks = (fd.hooks || []).map((html, i) => ({ id: Date.now() + i, html: html || '' }))
          setHooks(loadedHooks.length ? loadedHooks : [{ id: Date.now(), html: '' }])
          setBody(fd.body || '')
          setBodyInitial(fd.body || '')
          setBodyComments(fd.comments || [])
          setEditorVersion(v => v + 1)   // força o RichEditor a remontar com o conteúdo carregado
          // Marca este conteúdo carregado como "salvo" (baseline pra detectar edições)
          savedSnapRef.current = JSON.stringify({
            meta: { ads_number: fd.ads_number || '', angle: fd.angle || '', format: fd.format || '', avatar: fd.avatar || '', editing_notes: fd.editing_notes || '', video_ref: fd.video_ref || '' },
            briefing: { ...EMPTY_BRIEFING, ...(fd.briefing || {}) },
            hooks: (fd.hooks || []),
            body: fd.body || '',
            comments: fd.comments || [],
          })
          if (fd.status === 'final') {
            toast(`Abrindo "${d.title}" (AD finalizado, use como referência)`)
          } else {
            toast(`Continuando rascunho: ${d.title}`)
          }
        }
      })
      .catch(() => { toast.error('Não foi possível carregar esse anúncio'); navigate('/criar-copy', { replace: true }) })
      .finally(() => setLoadingDraft(false))
  }, [editingId])  // eslint-disable-line

  const resetForm = () => {
    setMeta(emptyMeta())
    setBriefing({ ...EMPTY_BRIEFING })
    setHooks([{ id: Date.now(), html: '' }])
    setBody('')
    setBodyInitial('')
    setBodyComments([])
    setStructureGuide({ hook: '', hook_text: '', body: [] })
    setSelectedRef(null)          // limpa a "Referência ativa" do painel lateral
    setLoadedDraft(null)
    setEditorVersion(v => v + 1)  // força RichEditor a remontar com conteúdo vazio
    // Limpa do localStorage também (todas as keys do draft atual)
    clearPersistedKeys(
      `${persistKey}:meta`,
      `${persistKey}:briefing`,
      `${persistKey}:hooks`,
      `${persistKey}:body`,
      `${persistKey}:bodyComments`,
      `${persistKey}:structure`,
      `${persistKey}:structureVisible`,
    )
    if (editingId) setSearchParams({})
  }

  // Swipe vindo do SwipePage via sessionStorage → vira referência ad-hoc.
  // Agora é tratada exatamente como qualquer outra referência (selectedRef único).
  useEffect(() => {
    const raw = sessionStorage.getItem('swipe_reference')
    if (raw) {
      try {
        const swipe = JSON.parse(raw)
        const content = (() => {
          try { return typeof swipe.content === 'string' ? JSON.parse(swipe.content) : swipe.content }
          catch { return { raw: swipe.content } }
        })()
        // Monta o markdown com Hook + Body pra qualquer tipo (ad, hook, orgânico).
        // buildSwipeOrganicMarkdown já trata cada caso: hook+body, só hook, ou só body.
        const formattedContent = buildSwipeOrganicMarkdown(content) || content.body || content.hook_written || content.hook || swipe.content
        const virtual = {
          id: `swipe-${swipe.id}`,
          type: swipe.tag === 'ad' ? 'transcript_ad' : swipe.tag === 'hook' ? 'hook' : 'transcript_organic',
          content: formattedContent,
          metadata: {
            title: content.title || `Swipe de ${swipe.tag}`,
            source: 'swipe',
            niche: content.niche,
            seven_layers: content.seven_layers || null,
          },
        }
        setSelectedRef(virtual)
        setAiOpen(true)
      } catch {}
      sessionStorage.removeItem('swipe_reference')
    }

    // Conceito vindo do Brainstorm ADS → vira referência estratégica + pré-preenche meta.
    const rawConcept = sessionStorage.getItem('brainstorm_concept')
    if (rawConcept) {
      try {
        const c = JSON.parse(rawConcept)
        const cam = c.camadas || {}
        const val = (x) => (x && typeof x === 'object' ? x.valor : x) || ''
        const lines = [
          `## Conceito: ${c.titulo || 'Brainstorm'}`,
          c.porta ? `Porta: ${c.porta}` : '',
          c.leilao_que_escapa ? `Leilão que escapa: ${c.leilao_que_escapa}` : '',
          c.racional ? `Racional: ${c.racional}` : '',
          '',
          '## Estratégia (7 Camadas)',
          val(cam.estrutura_invisivel) && `- Estrutura Invisível: ${val(cam.estrutura_invisivel)}`,
          val(cam.formato) && `- Formato: ${val(cam.formato)}`,
          val(cam.angulo) && `- Ângulo: ${val(cam.angulo)}`,
          val(cam.fatia_publico) && `- Fatia de Público: ${val(cam.fatia_publico)}`,
          val(cam.avatar) && `- Avatar: ${val(cam.avatar)}`,
          val(cam.tema) && `- Tema: ${val(cam.tema)}`,
          val(cam.nivel_consciencia) && `- Nível de Consciência: ${val(cam.nivel_consciencia)}`,
        ].filter(Boolean)
        setSelectedRef({
          id: `brainstorm-${Date.now()}`,
          type: 'transcript_ad',
          content: lines.join('\n'),
          metadata: { title: `Conceito: ${c.titulo || 'Brainstorm'}`, source: 'brainstorm' },
        })
        setMeta((prev) => ({
          ...prev,
          angle: val(cam.angulo) || prev.angle,
          format: val(cam.formato) || prev.format,
          avatar: val(cam.avatar) || prev.avatar,
        }))
        setAiOpen(true)
      } catch {}
      sessionStorage.removeItem('brainstorm_concept')
    }

    // Hook vindo do Swipe (botão "Usar hook na copy") → pré-preenche o primeiro hook
    const prefillHook = sessionStorage.getItem('prefill_hook')
    if (prefillHook) {
      const html = `<p>${prefillHook.replace(/\n/g, '</p><p>')}</p>`
      setHooks([{ id: Date.now(), html }])
      setHooksOpen(true)
      sessionStorage.removeItem('prefill_hook')
    }
  }, [])

  // Compat — alguns trechos antigos referenciam selectedReference
  const selectedReference = selectedRef

  const setMetaField = (key, val) => setMeta((prev) => ({ ...prev, [key]: val }))
  const setBriefingField = (key, val) => setBriefing((prev) => ({ ...prev, [key]: val }))

  const addHook = () => {
    setHooks((prev) => [...prev, { id: Date.now(), html: '' }])
    setHooksOpen(true)
  }
  const removeHook = (id) => setHooks((prev) => prev.filter((h) => h.id !== id))
  const updateHook = (id, html) => setHooks((prev) => prev.map((h) => h.id === id ? { ...h, html } : h))

  // Snapshot do conteúdo (pra detectar edições não salvas vs o último save no backend)
  const currentSnap = () => JSON.stringify({
    meta, briefing, hooks: hooks.map(h => h.html), body, comments: bodyComments,
  })
  // É "sujo" se há conteúdo digitado E ele difere do último estado salvo no backend
  const isDirty = () => {
    const hasContent = hooks.some(h => h.html?.replace(/<[^>]*>/g, '').trim())
      || body.replace(/<[^>]*>/g, '').trim() || meta.ads_number.trim()
    if (!hasContent) return false
    return currentSnap() !== savedSnapRef.current
  }

  const handleSave = async (status = 'draft') => {
    const hasContent = hooks.some(h => h.html?.replace(/<[^>]*>/g,'').trim()) || body.replace(/<[^>]*>/g,'').trim() || meta.ads_number.trim()
    if (!hasContent) { toast.error('Preencha ao menos um campo antes de salvar'); return false }
    setSaving(true)
    try {
      const title = meta.ads_number ? `ADS ${meta.ads_number}` : (meta.angle || 'Anúncio sem título')
      // Preserva rating existente quando editando
      const existingRating = loadedDraft?.fields_data?.rating
      const fields_data = {
        source_type: 'manual',
        status,                        // 'draft' | 'final'
        ...meta,
        briefing,                      // briefing de criação do ADS (3 grupos)
        hooks: hooks.map(h => h.html),
        body,
        comments: bodyComments,
        ...(existingRating ? { rating: existingRating } : {}),
      }

      if (editingId) {
        // Atualiza draft existente
        await api.patch(`/drafts/${editingId}`, {
          title,
          project_id: activeProject?.id || undefined,
          fields_data,
        })
        savedSnapRef.current = currentSnap()   // marca como salvo (limpa o "dirty")
        toast.success(status === 'final' ? '✅ AD finalizado atualizado!' : 'Rascunho atualizado!')
      } else {
        // Cria novo
        await api.post('/drafts', {
          title,
          project_id: activeProject?.id || undefined,
          fields_data,
        })
        toast.success(status === 'final' ? '✅ AD finalizado salvo!' : 'Rascunho salvo!')
        resetForm()
      }
      return true
    } catch {
      toast.error('Erro ao salvar')
      return false
    } finally { setSaving(false) }
  }

  // "Novo" — pop-up perguntando se salva no rascunho ou exclui o que está escrito,
  // depois reseta toda a área de escrita.
  const handleNew = async () => {
    const hasContent =
      body.replace(/<[^>]*>/g, '').trim() ||
      hooks.some(h => h.html?.replace(/<[^>]*>/g, '').trim()) ||
      meta.ads_number.trim()

    // Nada escrito → começa nova direto
    if (!hasContent) { resetForm(); return }

    const choice = await chooseAction({
      title: 'Começar uma copy nova?',
      message: 'O que você quer fazer com o que está escrito agora?',
      choices: [
        { label: 'Salvar no rascunho', value: 'save', primary: true },
        { label: 'Excluir', value: 'discard', danger: true },
      ],
      cancelLabel: 'Cancelar',
    })

    if (choice === null) return // cancelou — mantém tudo

    if (choice === 'save') {
      const ok = await handleSave('draft')
      if (!ok) return // falha ao salvar → não reseta pra não perder a copy
      // handleSave('draft') de copy nova já reseta; quando editando, reseta aqui também
      resetForm()
    } else if (choice === 'discard') {
      resetForm()
    }
  }

  // ── Guarda de navegação: avisa se sair da página com edições não salvas ──
  // Mantém refs frescas pras funções (o store guarda referências estáveis).
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  const saveDraftRef = useRef(null)
  saveDraftRef.current = () => handleSave('draft')
  const finalizeRef = useRef(null)
  finalizeRef.current = () => handleSave('final')

  useEffect(() => {
    const guard = useEditorGuard.getState()
    guard.register({
      isDirty: () => isDirtyRef.current(),
      saveDraft: () => saveDraftRef.current(),
      finalize: () => finalizeRef.current(),
    })
    // beforeunload: aviso nativo ao fechar/recarregar a janela com edições não salvas
    const onBeforeUnload = (e) => {
      if (isDirtyRef.current()) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      useEditorGuard.getState().unregister()
    }
  }, [])

  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      {/* ── Coluna principal — editor ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Feedback de carregamento (só na 1ª abertura do draft, sem estado local) */}
        {loadingDraft && !loadedDraft && (
          <div style={{
            marginBottom: '14px', padding: '10px 14px', borderRadius: '8px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', gap: '10px',
            fontSize: '12px', color: 'var(--text-secondary)',
          }}>
            <span style={{ width: '13px', height: '13px', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
            Carregando rascunho…
          </div>
        )}
        {/* Banner quando editando um ad existente */}
        {editingId && loadedDraft && (
          <div style={{
            marginBottom: '14px', padding: '10px 14px',
            borderRadius: '8px',
            background: loadedDraft.fields_data?.status === 'final' ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${loadedDraft.fields_data?.status === 'final' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {loadedDraft.fields_data?.status === 'final' ? '✅' : '✏️'} Editando: <strong style={{ color: 'var(--text-primary)' }}>{loadedDraft.title}</strong>
              {loadedDraft.fields_data?.status === 'final' && (
                <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>(AD finalizado)</span>
              )}
            </div>
            <button
              onClick={handleNew}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 10px', borderRadius: '5px', fontSize: '11px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              <Plus size={11} /> Novo anúncio
            </button>
          </div>
        )}

        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--accent)' }}>Escrever</span>
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Preencha os campos do ADS e escreva sua copy.
            </p>
            {/* Switcher de modos + Boost */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '3px', width: 'fit-content' }}>
                {[
                  { id: 'manual',  label: '🖊️ Manual',    desc: 'Você escreve' },
                  { id: 'hibrido', label: '🤝 Híbrido',   desc: 'IA sugere quando pedir' },
                  { id: 'auto',    label: '🤖 Automático', desc: 'IA gera tudo (em construção)', disabled: true },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => !m.disabled && setWriteMode(m.id)}
                    disabled={m.disabled}
                    title={m.desc}
                    style={{
                      padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                      background: writeMode === m.id ? 'var(--accent)' : 'transparent',
                      color: writeMode === m.id ? '#fff' : (m.disabled ? 'var(--text-muted)' : 'var(--text-secondary)'),
                      border: 'none', cursor: m.disabled ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font)', fontWeight: writeMode === m.id ? 500 : 400,
                      opacity: m.disabled ? 0.5 : 1,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Boost: liga o modelo premium (Opus). Escondido da UI por ora (BOOST_UI_ENABLED). */}
              {BOOST_UI_ENABLED && (
                <button
                  onClick={() => setBoostOn((v) => !v)}
                  title={boostOn
                    ? 'Boost ligado: usa o modelo premium (Opus), mais qualidade e um pouco mais lento'
                    : 'Boost desligado: modelo padrão (Sonnet), rápido. Ligue pra qualidade máxima.'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                    background: boostOn ? 'linear-gradient(90deg,#8b5cf6,#ec4899)' : 'var(--bg-elevated)',
                    border: `1px solid ${boostOn ? 'transparent' : 'var(--border-default)'}`,
                    color: boostOn ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer', fontFamily: 'var(--font)',
                    boxShadow: boostOn ? '0 1px 8px rgba(139,92,246,0.4)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <Zap size={13} fill={boostOn ? '#fff' : 'none'} />
                  Boost {boostOn ? 'ON' : 'OFF'}
                </button>
              )}
            </div>

            {/* Oferta ativa — a IA escreve PRA o projeto/oferta selecionado na sidebar */}
            {activeProject && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '12px',
                padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                background: '#8b5cf615', border: '1px solid #8b5cf6', color: '#8b5cf6',
                fontWeight: 500, width: 'fit-content',
              }}
                title="A IA escreve com base no dossiê desta oferta. Troque o projeto na barra lateral pra mudar a oferta."
              >
                <Target size={13} />
                Oferta: {activeProject.name}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexShrink: 0 }}>
            {/* Novo anúncio — limpa formulário e localStorage */}
            <button
              onClick={handleNew}
              title="Começar uma copy nova do zero"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '8px 12px', borderRadius: '7px', fontSize: '12px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              <Plus size={12} /> Novo
            </button>
            {/* Toggle do painel de referência */}
            <button
              onClick={() => setAiOpen((v) => !v)}
              title={aiOpen ? 'Fechar referência' : 'Abrir referência'}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 12px', borderRadius: '7px', fontSize: '12px',
                background: aiOpen ? '#06b6d4' : 'transparent',
                border: `1px solid ${aiOpen ? '#06b6d4' : 'var(--border-default)'}`,
                color: aiOpen ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {aiOpen ? <ChevronRight size={12} /> : <BookOpen size={12} />}
              {aiOpen ? 'Fechar' : 'Abrir referência'}
            </button>
          </div>
        </div>

        {/* Briefing — colapsável, fechada por padrão (vem ANTES das informações) */}
        <Section title="Briefing do Anúncio" defaultOpen={false}>
          {BRIEFING_GROUPS.map((group) => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                marginTop: '4px',
              }}>
                {group.title} →
              </div>
              {group.fields.map(({ key, label, placeholder, long }) => (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '5px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4, flex: 1 }}>
                      {label}
                    </label>
                    {/* Briefing é pessoal — sem sugestão de IA aqui. Só importar swipe no campo de comunicação. */}
                    {key === 'organic_base' && (
                      <button
                        type="button"
                        onClick={() => setShowOrganicSwipePicker(true)}
                        title="Escolher um swipe orgânico já salvo"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '4px 9px', borderRadius: '5px', fontSize: '11px',
                          background: 'transparent', border: '1px solid #8b5cf6', color: '#8b5cf6',
                          cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500, flexShrink: 0,
                        }}
                      >
                        <Download size={10} /> Importar do Swipe
                      </button>
                    )}
                  </div>
                  <textarea
                    className="tc-input tc-textarea"
                    value={briefing[key] || ''}
                    onChange={(e) => setBriefingField(key, e.target.value)}
                    rows={long ? 6 : 2}
                    placeholder={placeholder}
                    style={{ resize: 'vertical', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          ))}
        </Section>

        {/* Informações — colapsável, fechada por padrão */}
        <Section title="Informações do Anúncio" defaultOpen={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {META_FIELDS.slice(0, 3).map(({ label, key, placeholder, type }) => (
              <MetaField key={key} label={label} value={meta[key]} onChange={(v) => setMetaField(key, v)} type={type} placeholder={placeholder} />
            ))}
          </div>
          {META_FIELDS.slice(3).map(({ label, key, placeholder, type }) => {
            const importBtn = (onClick) => (
              <button
                type="button"
                onClick={onClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '3px 8px', borderRadius: '5px', fontSize: '11px',
                  background: 'transparent', border: '1px solid #8b5cf6', color: '#8b5cf6',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                <Download size={10} /> Importar do Swipe
              </button>
            )
            // Avatar e Vídeo Referência têm botão extra de importar do swipe
            if (key === 'avatar') {
              return (
                <MetaField
                  key={key} label={label} value={meta[key]}
                  onChange={(v) => setMetaField(key, v)} type={type} placeholder={placeholder}
                  headerAction={importBtn(() => setShowAvatarImport(true))}
                />
              )
            }
            if (key === 'video_ref') {
              return (
                <MetaField
                  key={key} label={label} value={meta[key]}
                  onChange={(v) => setMetaField(key, v)} type={type} placeholder={placeholder}
                  headerAction={importBtn(() => setShowAdRefImport(true))}
                />
              )
            }
            return (
              <MetaField key={key} label={label} value={meta[key]} onChange={(v) => setMetaField(key, v)} type={type} placeholder={placeholder} />
            )
          })}
        </Section>

        {/* Hooks — colapsável, fechada por padrão */}
        <Section
          title="Hooks"
          open={hooksOpen}
          onOpenChange={setHooksOpen}
          headerAction={
            <button onClick={addHook} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
              <Plus size={12} /> Adicionar hook
            </button>
          }
        >
          {writeMode === 'manual' && structureGuide?.hook && (
            <StructureGuide
              part="hook"
              hookText={structureGuide.hook}
              visible={guideVisible}
              onToggleVisible={() => setGuideVisible(v => !v)}
              onChangeHook={(t) => setStructureGuide(g => ({ ...g, hook: t }))}
            />
          )}
          {hooks.map((h, i) => (
            <HookBox
              key={`${editingId || 'new'}-${editorVersion}-${h.id}`}
              index={i}
              onChange={(html) => updateHook(h.id, html)}
              onRemove={() => removeHook(h.id)}
              canRemove={hooks.length > 1}
              initialContent={h.html}
              suggestButton={writeMode === 'hibrido' ? (
                <SuggestionButton
                  field="hook"
                  currentValue={h.html}
                  buildContext={buildAIContext}
                  onApply={(s) => {
                    // Substitui o hook por texto plain (vira HTML simples) e força remount
                    const html = `<p>${s.replace(/\n/g, '</p><p>')}</p>`
                    setHooks(prev => prev.map(x => x.id === h.id ? { ...x, html } : x))
                    setEditorVersion(v => v + 1)
                  }}
                  compact
                />
              ) : null}
            />
          ))}
        </Section>

        {/* Body — área principal, sempre expandida e bem maior */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Body
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {writeMode === 'manual' && (
                <button
                  onClick={importStructure}
                  disabled={loadingStructure}
                  title="A IA extrai a estrutura invisível do orgânico da Comunicação pra te guiar (sem copiar)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '4px 9px', borderRadius: '6px', fontSize: '11px',
                    background: 'transparent', border: '1px solid #8b5cf6',
                    color: '#8b5cf6', cursor: loadingStructure ? 'wait' : 'pointer',
                    fontFamily: 'var(--font)', fontWeight: 500,
                  }}
                >
                  {loadingStructure
                    ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…</>
                    : <><ListTree size={11} /> {hasGuide ? 'Recarregar estrutura invisível' : 'Carregar estrutura invisível'}</>}
                </button>
              )}
              {writeMode === 'manual' && hasGuide && (structureGuide.body || []).length > 0 && (
                <button
                  onClick={bodyHasStructure ? removeStructureFromBody : insertStructureIntoBody}
                  title={bodyHasStructure ? 'Remover os marcadores [bloco] do body' : 'Inserir os marcadores [bloco] no body'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '4px 9px', borderRadius: '6px', fontSize: '11px',
                    background: bodyHasStructure ? 'rgba(239,68,68,0.08)' : '#8b5cf6',
                    border: bodyHasStructure ? '1px solid rgba(239,68,68,0.5)' : 'none',
                    color: bodyHasStructure ? '#ef4444' : '#fff', cursor: 'pointer',
                    fontFamily: 'var(--font)', fontWeight: 500,
                  }}
                >
                  {bodyHasStructure ? <><X size={11} /> Remover do body</> : <><Plus size={11} /> Inserir no body</>}
                </button>
              )}
              {writeMode === 'hibrido' && (
                <SuggestionButton
                  field="body"
                  currentValue={body}
                  buildContext={buildAIContext}
                  onApply={(s) => {
                    const html = `<p>${s.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`
                    setBody(html)
                    setBodyInitial(html)
                    setEditorVersion(v => v + 1)
                  }}
                />
              )}
            </div>
          </div>
          {writeMode === 'manual' && (structureGuide?.body || []).length > 0 && (
            <StructureGuide
              part="body"
              steps={structureGuide.body}
              visible={guideVisible}
              onToggleVisible={() => setGuideVisible(v => !v)}
              onChangeSteps={(arr) => setStructureGuide(g => ({ ...g, body: arr }))}
            />
          )}
          <RichEditor
            key={`${editingId || 'new'}-${editorVersion}`}
            onChange={setBody}
            onCommentsChange={setBodyComments}
            placeholder="Escreva o corpo do ADS aqui..."
            minHeight={520}
            stickyToolbar
            initialContent={bodyInitial}
            initialComments={bodyComments}
            onImproveSelection={writeMode !== 'auto' ? improveSelection : undefined}
          />
        </div>

        {/* Salvar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: '7px', fontSize: '13px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            <Save size={14} /> {saving ? 'Salvando...' : 'Salvar rascunho'}
          </button>
          <button
            onClick={() => handleSave('final')}
            disabled={saving}
            className="tc-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px' }}
          >
            <Check size={14} /> {saving ? 'Salvando...' : 'AD finalizado'}
          </button>
        </div>
      </div>

      {/* ── Painel lateral — Referência ── */}
      {aiOpen && (
        <aside style={{
          width: '420px', flexShrink: 0,
          height: 'calc(100vh - var(--topbar-height) - 56px)',
          position: 'sticky', top: '20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '10px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <RightPanel
            writeMode={writeMode}
            memoryItems={referenceItems}
            finalDrafts={finalDrafts}
            selectedRef={selectedRef}
            setSelectedRef={selectRef}
            loadAllMemory={() => { loadSwipeRefs(); loadAllMemory() }}
            refLoading={refLoading}
            buildAIContext={buildAIContext}
            chatKey={persistKey}
            structureGuide={writeMode === 'manual' ? structureGuide : null}
            organicBase={stripHtml(briefing?.organic_base || '')}
          />
        </aside>
      )}

      {showOrganicSwipePicker && (
        <OrganicSwipePickerModal
          onClose={() => setShowOrganicSwipePicker(false)}
          onPick={(item) => {
            // Preenche o campo Comunicação (organic_base). NÃO mexe na referência ativa:
            // a aba Referência já mostra esse vídeo pra leitura, e assim não sobrescreve
            // um conceito do Brainstorm que esteja ocupando o slot de referência.
            const parts = []
            if (item.url) parts.push(item.url)
            if (item.formattedContent) parts.push(item.formattedContent)
            setBriefingField('organic_base', parts.join('\n\n'))
            setShowOrganicSwipePicker(false)
            setAiOpen(true)
            toast.success('Importado pra Comunicação')
          }}
        />
      )}
      {showAvatarImport && (
        <ImportAvatarModal
          onClose={() => setShowAvatarImport(false)}
          onPick={(desc, link) => {
            const combined = link ? `${desc}\n${link}`.trim() : desc
            setMetaField('avatar', combined)
          }}
        />
      )}

      {showAdRefImport && (
        <ImportAdRefModal
          onClose={() => setShowAdRefImport(false)}
          onPick={(link) => setMetaField('video_ref', link)}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
