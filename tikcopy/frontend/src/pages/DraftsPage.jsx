import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Trash2, CheckCircle2, Clock, Trophy, FlaskConical, ThumbsDown, ThumbsUp, Eye, Edit2, Target, X, Languages, Loader2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import DownloadMenu from '../components/DownloadMenu'
import { buildCopyTxt } from '../utils/download'
import { confirmAction } from '../stores/useConfirmStore'

const TABS = [
  { key: 'final', label: 'Anúncios Finalizados' },
  { key: 'draft', label: 'Meus Rascunhos' },
]

const RATING_META = {
  validado: { label: 'Validado', icon: Trophy,        color: '#16a34a', bg: 'rgba(46,184,92,0.1)',  border: 'rgba(46,184,92,0.3)' },
  em_teste: { label: 'Em teste', icon: FlaskConical,  color: '#0891b2', bg: 'rgba(255,62,94,0.1)',  border: 'rgba(255,62,94,0.3)' },
  ruim:     { label: 'Ruim',     icon: ThumbsDown,    color: '#dc2626', bg: 'rgba(220,38,38,0.1)',  border: 'rgba(220,38,38,0.3)' },
}

function StatusBadge({ status }) {
  if (status === 'final') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
        background: 'rgba(46,184,92,0.1)', color: '#16a34a',
        border: '1px solid rgba(46,184,92,0.3)',
      }}>
        <CheckCircle2 size={10} /> FINALIZADO
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
      background: 'rgba(255,62,94,0.08)', color: '#d97706',
      border: '1px solid rgba(255,62,94,0.25)',
    }}>
      <Clock size={10} /> RASCUNHO
    </span>
  )
}

function RatingPills({ value, onChange, compact = false }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {Object.entries(RATING_META).map(([key, m]) => {
        const Icon = m.icon
        const active = value === key
        return (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); onChange(active ? null : key) }}
            title={m.label}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: compact ? '2px 7px' : '4px 10px',
              borderRadius: '999px', fontSize: compact ? '10px' : '11px',
              background: active ? m.bg : 'transparent',
              border: `1px solid ${active ? m.border : 'var(--border-default)'}`,
              color: active ? m.color : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'var(--font)',
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon size={compact ? 9 : 11} />
            {!compact && m.label}
          </button>
        )
      })}
    </div>
  )
}

function HookRating({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: '3px' }}>
      {[
        { key: 'validado', Icon: ThumbsUp,   color: '#16a34a' },
        { key: 'ruim',     Icon: ThumbsDown, color: '#dc2626' },
      ].map(({ key, Icon, color }) => {
        const active = value === key
        return (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); onChange(active ? null : key) }}
            title={key === 'validado' ? 'Hook validou' : 'Hook não funcionou'}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '22px', height: '22px', borderRadius: '5px',
              background: active ? `${color}20` : 'transparent',
              border: `1px solid ${active ? color : 'var(--border-default)'}`,
              color: active ? color : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Icon size={11} />
          </button>
        )
      })}
    </div>
  )
}

function HooksList({ hooks, ratings, onRateHook }) {
  if (!hooks || hooks.length === 0) return null
  const stripHtml = (html) => {
    const div = document.createElement('div')
    div.innerHTML = html || ''
    return (div.textContent || '').trim()
  }
  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
        Hooks ({hooks.length}) — avalie quais validaram
      </div>
      {hooks.map((h, i) => {
        const text = stripHtml(h)
        if (!text) return null
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 10px', borderRadius: '6px',
            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
          }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, fontWeight: 600 }}>#{i + 1}</span>
            <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {text}
            </span>
            <HookRating value={ratings[i]} onChange={(v) => onRateHook(i, v)} />
          </div>
        )
      })}
    </div>
  )
}

function DraftPreview({ draft }) {
  const fd = draft.fields_data || {}
  // Backend agora manda `body_preview` já em texto puro (lite). Fallback pros
  // campos antigos pra compatibilidade.
  const plain = fd.body_preview || (() => {
    const raw = fd.content || fd.hook || fd.body || ''
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  })()
  if (!plain) return null
  return (
    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5' }}>
      {plain.length > 160 ? plain.slice(0, 160) + '…' : plain}
    </div>
  )
}

function EmptyState({ label }) {
  return (
    <div style={{
      textAlign: 'center', padding: '40px 24px',
      border: '1px dashed var(--border-default)', borderRadius: '10px',
    }}>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

// ─── Modal: Visualizar Anúncio ────────────────────────────────────────────

function stripHtml(html) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  return (div.textContent || '').trim()
}

function adsCode(meta) {
  const raw = (meta?.ads_number || '').toString().trim()
  if (!raw) return 'ADS'
  const cleaned = raw.replace(/^(ads[\s\-_]*|#)/i, '').trim() || raw
  return `ADS ${cleaned}`
}

// Realça ⟦#N⟧ em azul dentro do HTML do body
function highlightMarkers(html) {
  if (!html) return ''
  return html.replace(/⟦#(\d+)⟧/g, '<span style="color:#1E88E5;font-weight:600">⟦#$1⟧</span>')
}

const LANG_LABEL_VIEW = { en: 'Inglês (EUA)', es: 'Espanhol (LATAM)', fr: 'Francês (França)', de: 'Alemão (Alemanha)', it: 'Italiano (Itália)' }

// Converte texto puro (com \n\n entre parágrafos) em HTML de parágrafos.
function plainToParagraphs(text) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return String(text || '').split(/\n{2,}/).map(p => `<p style="margin:0 0 10px">${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')
}

function ViewAdModal({ draft, onClose, onEdit, onUseAsReference }) {
  const fd = draft.fields_data || {}
  const code = adsCode(fd)
  const comments = fd.comments || []
  const [translations, setTranslations] = useState(fd.translations || {})
  const langCodes = Object.keys(translations)
  const [view, setView] = useState('original')
  const tr = view !== 'original' ? translations[view] : null

  // Gerar versão em outro idioma direto daqui (sem reabrir no Escrever)
  const [genLang, setGenLang] = useState('en')
  const [genBusy, setGenBusy] = useState(false)
  const [review, setReview] = useState(null)  // { lang, hooks:[], body }

  const generateLang = async () => {
    const plainHooks = (fd.hooks || []).map(h => stripHtml(h)).filter(Boolean)
    const plainBody = stripHtml(fd.body || '').trim()
    if (!plainHooks.length && !plainBody) { toast.error('Esta copy não tem conteúdo para traduzir'); return }
    setGenBusy(true)
    try {
      const { data } = await api.post('/ai/localize', { hooks: plainHooks, body: plainBody, lang: genLang, project_id: draft.project_id || undefined })
      setReview({ lang: genLang, hooks: data.hooks || [], body: data.body || '' })
    } catch {
      toast.error('Falha ao gerar a versão traduzida')
    } finally { setGenBusy(false) }
  }

  const confirmReview = async () => {
    const next = { ...translations, [review.lang]: { hooks: review.hooks.filter(h => (h || '').trim()), body: review.body, at: Date.now() } }
    try {
      await api.patch(`/drafts/${draft.id}`, { fields_data: { ...fd, translations: next } })
      fd.translations = next  // mantém o objeto local em sincronia
      setTranslations(next)
      setView(review.lang)
      setReview(null)
      toast.success(`Versão em ${LANG_LABEL_VIEW[review.lang] || review.lang} salva`)
    } catch {
      toast.error('Erro ao salvar a versão')
    }
  }

  // Hooks e body exibidos conforme o idioma selecionado
  const hooks = tr
    ? (tr.hooks || []).filter(h => (h || '').trim())
    : (fd.hooks || []).map(h => stripHtml(h)).filter(Boolean)

  const metaLines = [
    ['Nº do ADS',  fd.ads_number],
    ['Ângulo',     fd.angle],
    ['Formato',    fd.format],
    ['Avatar',     fd.avatar],
    ['Instruções', fd.editing_notes],
    ['Vídeo Ref.', fd.video_ref],
  ].filter(([, v]) => v && String(v).trim())

  const linkify = (text) => {
    if (!text) return ''
    return String(text).replace(/(https?:\/\/[^\s\]\)<>]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer" style="color:#1155CC;text-decoration:underline;word-break:break-all">$1</a>'
    )
  }

  return (
    <>
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', width: '100%', maxWidth: '780px', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              Visualização
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              {draft.title || 'Sem título'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border-default)',
            borderRadius: '6px', padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Idiomas: alternância (se houver) + gerar nova versão */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px 0' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['original', ...langCodes].map((c) => (
              <button
                key={c}
                onClick={() => setView(c)}
                style={{
                  fontSize: '12px', padding: '5px 12px', borderRadius: '999px', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  background: view === c ? 'var(--accent)' : 'transparent',
                  color: view === c ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${view === c ? 'var(--accent)' : 'var(--border-default)'}`,
                }}
              >
                {c === 'original' ? 'Original' : (LANG_LABEL_VIEW[c] || c)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              value={genLang}
              onChange={(e) => setGenLang(e.target.value)}
              disabled={genBusy}
              style={{ padding: '6px 8px', borderRadius: '7px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'var(--font)' }}
            >
              {Object.entries(LANG_LABEL_VIEW).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <button
              onClick={generateLang}
              disabled={genBusy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '7px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: genBusy ? 'default' : 'pointer', fontFamily: 'var(--font)', fontWeight: 500, opacity: genBusy ? 0.7 : 1 }}
            >
              {genBusy ? <Loader2 size={12} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Languages size={12} />}
              {genBusy ? 'Gerando…' : (langCodes.includes(genLang) ? 'Regerar idioma' : 'Gerar em outro idioma')}
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {/* Informações */}
          {metaLines.length > 0 && (
            <section style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '10px' }}>
                Informações
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {metaLines.map(([k, v]) => (
                  <div key={k} style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    <strong>{k}:</strong>{' '}
                    <span dangerouslySetInnerHTML={{ __html: linkify(v) }} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Hooks */}
          {hooks.length > 0 && (
            <section style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '10px' }}>
                Hooks
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {hooks.map((h, i) => (
                  <div key={i} style={{
                    fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6,
                    padding: '10px 12px', borderRadius: '6px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  }}>
                    <strong style={{ color: 'var(--accent)' }}>{code}H{i + 1}:</strong> {h}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Body */}
          {(tr ? tr.body : fd.body) && (
            <section style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '10px' }}>
                Body
              </div>
              <div
                style={{
                  fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.75,
                  padding: '14px 16px', borderRadius: '8px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                }}
                dangerouslySetInnerHTML={{ __html: tr ? linkify(plainToParagraphs(tr.body)) : highlightMarkers(linkify(fd.body)) }}
              />
            </section>
          )}

          {/* Comentários do editor */}
          {comments.length > 0 && (
            <section>
              <div style={{ fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '10px' }}>
                Comentários do editor
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {comments.map((c, i) => (
                  <div key={c.id || i} style={{
                    fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6,
                    padding: '10px 12px', borderRadius: '6px',
                    background: 'rgba(30,136,229,0.06)', border: '1px solid rgba(30,136,229,0.2)',
                  }}>
                    <strong style={{ color: '#1E88E5' }}>⟦#{i + 1}⟧</strong> {c.text}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer com ações */}
        <div style={{
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
          padding: '14px 22px', borderTop: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px', borderRadius: '7px', fontSize: '12px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            Fechar
          </button>
          <div style={{ marginRight: 'auto' }}>
            <DownloadMenu
              filename={`${(draft.title || 'anuncio').replace(/[^\w\s-]/g, '').trim()}${view !== 'original' ? ' (' + (LANG_LABEL_VIEW[view] || view) + ')' : ''}`}
              getContent={() => buildCopyTxt({
                ...fd,
                hooks: hooks.map(h => ({ html: h })),
                body: tr ? tr.body : (fd.body || ''),
                comments,
              })}
              label={view === 'original' ? 'Baixar' : 'Baixar versão'}
            />
          </div>
          <button
            onClick={onUseAsReference}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '7px', fontSize: '12px',
              background: 'transparent', border: '1px solid var(--accent)',
              color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
            }}
          >
            <Target size={12} /> Bater controle
          </button>
          <button
            onClick={onEdit}
            className="tc-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '12px' }}
          >
            <Edit2 size={12} /> Editar
          </button>
        </div>
      </div>
    </div>

    {review && (
      <div onClick={() => setReview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Revisar tradução</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{LANG_LABEL_VIEW[review.lang] || review.lang}</div>
            </div>
            <button onClick={() => setReview(null)} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={14} /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>Edite o que quiser antes de salvar.</div>
            {review.hooks.length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '8px' }}>Hooks</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {review.hooks.map((h, i) => (
                    <textarea key={i} value={h} rows={2}
                      onChange={(e) => setReview(r => ({ ...r, hooks: r.hooks.map((x, j) => j === i ? e.target.value : x) }))}
                      style={{ width: '100%', resize: 'vertical', padding: '9px 11px', borderRadius: '7px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font)', lineHeight: 1.5 }} />
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '8px' }}>Body</div>
              <textarea value={review.body} rows={14}
                onChange={(e) => setReview(r => ({ ...r, body: e.target.value }))}
                style={{ width: '100%', resize: 'vertical', padding: '12px 14px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: '13.5px', fontFamily: 'var(--font)', lineHeight: 1.7 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={() => setReview(null)} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Descartar</button>
            <button onClick={confirmReview} className="tc-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}><Check size={14} /> Confirmar</button>
          </div>
        </div>
      </div>
    )}

    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function ExportButton({ draft }) {
  // A lista de drafts vem "lite" (sem o HTML do body). Buscamos o draft COMPLETO
  // só na hora do download, pra o body não sair vazio no PDF/DOCX/TXT.
  const buildContent = async () => {
    let fd = draft.fields_data || {}
    try {
      const res = await api.get(`/drafts/${draft.id}`)
      if (res.data?.fields_data) fd = res.data.fields_data
    } catch { /* sem rede: usa o que já tem */ }
    const payload = {
      meta: {
        ads_number: fd.ads_number,
        angle: fd.angle,
        format: fd.format,
        avatar: fd.avatar,
        editing_notes: fd.editing_notes,
        video_ref: fd.video_ref,
      },
      hooks: (fd.hooks || []).map(h => ({ html: h })),
      body: fd.body || fd.content || '',
      comments: fd.comments || [],
      status: fd.status,
    }
    return buildCopyTxt(payload)
  }
  const safeTitle = (draft.title || 'anuncio').replace(/[^\w\-]+/g, '_').slice(0, 50)
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DownloadMenu filename={safeTitle} getContent={buildContent} label="Baixar" />
    </div>
  )
}

export default function DraftsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('final')
  const [viewing, setViewing] = useState(null)

  // useQuery: cache stale-while-revalidate. Voltar pra esta página dentro
  // de 30s = instantâneo (sem refetch).
  const draftsQuery = useQuery({
    queryKey: ['drafts'],
    queryFn: () => api.get('/drafts').then(r => r.data || []),
  })
  const drafts = draftsQuery.data || []
  const loading = draftsQuery.isLoading

  // Helpers pra mutar localmente sem refetch
  const setDrafts = (updater) => {
    queryClient.setQueryData(['drafts'], (old) => {
      const current = old || []
      return typeof updater === 'function' ? updater(current) : updater
    })
  }
  const load = () => queryClient.invalidateQueries({ queryKey: ['drafts'] })

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!(await confirmAction({ title: 'Deletar esta copy?', confirmLabel: 'Deletar' }))) return
    try {
      await api.delete(`/drafts/${id}`)
      setDrafts((prev) => prev.filter((d) => d.id !== id))
      toast.success('Removido')
    } catch {
      toast.error('Erro ao deletar')
    }
  }

  const handleOpen = (d) => {
    navigate(`/criar-copy?id=${d.id}`)
  }

  // Abre o modal "Visualizar" buscando o draft completo (lista vem em modo lite)
  const openViewing = async (d) => {
    const loadingToast = toast.loading('Carregando…')
    try {
      const res = await api.get(`/drafts/${d.id}`)
      setViewing(res.data)
    } catch {
      toast.error('Erro ao carregar anúncio')
    } finally {
      toast.dismiss(loadingToast)
    }
  }

  const handleUseAsReference = async (d) => {
    // A lista vem em modo "lite" (sem HTML do body). Precisamos do draft completo.
    let full
    try {
      const res = await api.get(`/drafts/${d.id}`)
      full = res.data
    } catch {
      return toast.error('Erro ao carregar anúncio completo')
    }
    const fd = full.fields_data || {}
    const code = adsCode(fd)
    const rating = fd.rating || {}
    const hookRatings = rating.hooks || {}

    // Converte HTML preservando parágrafos (cada </p> vira \n\n).
    // Se o texto tiver virado um bloco gigante sem quebras, quebra a cada
    // 2 frases pra não ficar uma muralha de texto.
    const htmlToParagraphs = (html) => {
      if (!html) return ''
      const normalized = html
        .replace(/<\/p\s*>/gi, '\n\n')
        .replace(/<\/div\s*>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
      const div = document.createElement('div')
      div.innerHTML = normalized
      let text = (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim()

      // Se acabou virando um bloco único sem quebras, quebra a cada 2 frases
      const hasBreaks = /\n\n/.test(text)
      if (!hasBreaks && text.length > 280) {
        // Captura também trecho final sem pontuação pra não perder nada
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

    // Hooks: só os marcados como "validado". Se nenhum tiver avaliação,
    // pega todos (compatibilidade com ads antigos).
    const allHooks = fd.hooks || []
    const hasAnyRating = Object.keys(hookRatings).length > 0
    const useIdx = allHooks
      .map((_, i) => i)
      .filter(i => hasAnyRating ? hookRatings[i] === 'validado' : true)

    // Hooks: cada linha tem o código em **negrito** (renderiza via Markdown)
    // Ex.: **ADS 01H1** — texto do hook
    const hooksBlock = useIdx
      .map(i => {
        const txt = stripHtml(allHooks[i])
        if (!txt) return null
        return `**${code}H${i + 1}** — ${txt}`
      })
      .filter(Boolean)
      .join('\n\n')

    const bodyText = htmlToParagraphs(fd.body || '')

    // Estrutura com headings markdown (renderizados como títulos pelo Markdown)
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
    const formattedContent = sections.join('\n\n')

    const refPayload = {
      id: full.id,
      tag: 'ad',
      source: fd.video_ref || null,
      content: JSON.stringify({
        title: code,                  // título do painel = ADS 01
        body: formattedContent,
        niche: fd.angle || fd.format,
      }),
    }
    try {
      sessionStorage.setItem('swipe_reference', JSON.stringify(refPayload))
      const n = useIdx.length
      const msg = hasAnyRating && n > 0
        ? `"${full.title}" carregado · ${n} hook${n > 1 ? 's' : ''} validado${n > 1 ? 's' : ''}`
        : `"${full.title}" carregado como referência`
      toast.success(msg)
      navigate('/criar-copy')
    } catch (err) {
      console.error('[bater controle]', err)
      toast.error('Erro ao carregar referência')
    }
  }

  // Patch helper
  const patchFields = async (draft, patch) => {
    const fd = draft.fields_data || {}
    const newFd = { ...fd, ...patch }
    setDrafts((prev) => prev.map((d) => d.id === draft.id ? { ...d, fields_data: newFd } : d))
    try {
      await api.patch(`/drafts/${draft.id}`, { fields_data: newFd })
    } catch {
      toast.error('Erro ao salvar avaliação')
      load()  // rollback
    }
  }

  const setAdRating = (draft, rating) => {
    const fd = draft.fields_data || {}
    patchFields(draft, { rating: { ...(fd.rating || {}), ad: rating } })
  }

  const setHookRating = (draft, hookIdx, rating) => {
    const fd = draft.fields_data || {}
    const ratings = { ...((fd.rating && fd.rating.hooks) || {}) }
    if (rating === null) delete ratings[hookIdx]
    else ratings[hookIdx] = rating
    patchFields(draft, { rating: { ...(fd.rating || {}), hooks: ratings } })
  }

  // Categorias — só ads "manual" (escritos na Escrever)
  const isManual = (d) =>
    !d.fields_data?.source_type || d.fields_data?.source_type === 'manual'
  const isFinal = (d) => isManual(d) && d.fields_data?.status === 'final'
  const isDraft = (d) => isManual(d) && d.fields_data?.status !== 'final'

  const counts = {
    final: drafts.filter(isFinal).length,
    draft: drafts.filter(isDraft).length,
  }

  // Memoiza filtragem pra não recalcular em cada re-render (ex: abrir modal)
  const current = useMemo(
    () => tab === 'final' ? drafts.filter(isFinal) : drafts.filter(isDraft),
    [tab, drafts]
  )

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Minhas <span style={{ color: 'var(--accent)' }}>Copys</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Rascunho → clique pra continuar escrevendo. Finalizado → visualize, edite ou use como controle.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(({ key, label }) => (
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
            {label}
            <span style={{
              fontSize: '10px',
              background: tab === key ? 'var(--accent)' : 'var(--bg-elevated)',
              border: tab === key ? 'none' : '1px solid var(--border-default)',
              borderRadius: '999px', padding: '1px 7px',
              color: tab === key ? '#fff' : 'var(--text-muted)', fontWeight: 700,
            }}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando...</div>
      ) : current.length === 0 ? (
        <EmptyState label={
          tab === 'final'
            ? 'Nenhum anúncio finalizado ainda. Em "Escrever", clique em AD finalizado quando terminar.'
            : 'Nenhum rascunho em andamento. Em "Escrever", salve como rascunho.'
        } />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {current.map((d) => {
            const fd = d.fields_data || {}
            const rating = fd.rating || {}
            const hookRatings = rating.hooks || {}
            const hooks = fd.hooks || []
            const showHookRatings = tab === 'final' && hooks.length > 1
            return (
              <div
                key={d.id}
                onClick={() => tab === 'final' ? openViewing(d) : handleOpen(d)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '10px', padding: '14px 16px',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.title || 'Sem título'}
                      </div>
                      <StatusBadge status={fd.status} />
                      {fd.comments?.length > 0 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {fd.comments.length}
                        </span>
                      )}
                    </div>
                    <DraftPreview draft={d} />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {new Date(d.updated_at || d.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {tab === 'final' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); openViewing(d) }}
                          title="Visualizar"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
                          }}
                        >
                          <Eye size={11} /> Visualizar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpen(d) }}
                          title="Editar em Escrever"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
                          }}
                        >
                          <Edit2 size={11} /> Editar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUseAsReference(d) }}
                          title="Usar como referência em Escrever"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
                            background: 'transparent', border: '1px solid var(--accent)',
                            color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
                          }}
                        >
                          <Target size={11} /> Bater controle
                        </button>
                      </>
                    )}
                    <ExportButton draft={d} />
                    <button
                      onClick={(e) => handleDelete(d.id, e)}
                      style={{
                        padding: '5px 7px', borderRadius: '6px',
                        background: 'transparent', border: '1px solid var(--border-default)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                      title="Deletar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Avaliação — só pra ads finalizados */}
                {tab === 'final' && (
                  <div style={{
                    marginTop: '12px', paddingTop: '12px',
                    borderTop: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                        Avaliação do ad
                      </span>
                      <RatingPills value={rating.ad} onChange={(v) => setAdRating(d, v)} />
                    </div>

                    {showHookRatings && (
                      <HooksList
                        hooks={hooks}
                        ratings={hookRatings}
                        onRateHook={(idx, v) => setHookRating(d, idx, v)}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {viewing && (
        <ViewAdModal
          draft={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { const d = viewing; setViewing(null); handleOpen(d) }}
          onUseAsReference={() => { const d = viewing; setViewing(null); handleUseAsReference(d) }}
        />
      )}
    </div>
  )
}
