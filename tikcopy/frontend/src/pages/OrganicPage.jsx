import { useState, useEffect } from 'react'
import { Bookmark, Languages, User, X, ExternalLink, Video, FileVideo } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import usePersistedState from '../hooks/usePersistedState'
import useJobsStore from '../stores/useJobsStore'
import { confirmAction } from '../stores/useConfirmStore'
import useTaxonomyStore, { useAllNiches, useAllFormats } from '../stores/useTaxonomyStore'
import MemoryToggle from '../components/MemoryToggle'
import { buildOrganicTxt } from '../utils/download'
import DownloadMenu from '../components/DownloadMenu'
import ProgressBar, { ORGANIC_URL_STEPS } from '../components/ProgressBar'
import NicheSelect from '../components/NicheSelect'

async function saveHookText(hookText, result, niche) {
  if (!hookText?.trim()) return toast.error('Escolha o trecho que vai ser o hook')
  if (!niche || !niche.trim()) { toast.error('Selecione o nicho'); return false }
  const nicheClean = niche.trim()
  try {
    await api.post('/swipes', {
      tag: 'hook',
      content: JSON.stringify({
        hook: hookText.trim(),
        title: result.title,
        niche: nicheClean,
        source: 'organic',
        // Métricas do vídeo (views/likes/published) — mostradas no card
        metadata: result.metadata || null,
      }),
      source: result.source_url || result.metadata?.source_url || null,
    })
    toast.success(`Hook salvo no Swipe (nicho: ${nicheClean})!`)
    return true
  } catch {
    toast.error('Erro ao salvar no Swipe')
    return false
  }
}

// ── Select com criar novo (pra nicho/formato no modal) ───────
function SelectWithCreate({ label, value, onChange, options: optionsProp, kind, placeholder, required }) {
  const [creating, setCreating] = useState(false)
  const [custom, setCustom] = useState('')
  const allNiches = useAllNiches()
  const allFormats = useAllFormats()
  const addNiche = useTaxonomyStore((s) => s.addNiche)
  const addFormat = useTaxonomyStore((s) => s.addFormat)
  const options = kind === 'niche' ? allNiches : kind === 'format' ? allFormats : (optionsProp || [])
  const commit = (v) => {
    const val = (v || '').trim()
    if (!val) return
    if (kind === 'niche') addNiche(val)
    if (kind === 'format') addFormat(val)
    onChange(val)
    setCreating(false)
  }
  const isCustomValue = value && !options.includes(value)

  if (creating) {
    return (
      <div>
        <label className="tc-label">{label}{required && ' *'}</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            className="tc-input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Digite o novo nome…"
            style={{ flex: 1, fontSize: '13px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (custom.trim()) commit(custom.trim()) }
              if (e.key === 'Escape') { setCreating(false); setCustom('') }
            }}
          />
          <button type="button" onClick={() => { if (custom.trim()) commit(custom.trim()) }} style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px' }}>OK</button>
          <button type="button" onClick={() => { setCreating(false); setCustom('') }} style={{ padding: '6px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <label className="tc-label">{label}{required && ' *'}</label>
      <select
        className="tc-input"
        value={isCustomValue ? '__custom__' : (value || '')}
        onChange={(e) => {
          if (e.target.value === '__new__') { setCreating(true); return }
          onChange(e.target.value || '')
        }}
        style={{ width: '100%', fontSize: '13px' }}
      >
        <option value="">{placeholder || 'Selecione…'}</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        {isCustomValue && <option value="__custom__">★ {value} (custom)</option>}
        <option value="__new__">+ Criar novo…</option>
      </select>
    </div>
  )
}

// ── Modal: Salvar Hook (user escolhe trecho da transcrição) ──
function SaveHookModal({ result, niche: initialNiche, onClose }) {
  // Pré-preenche com a primeira frase do transcript como sugestão
  const initial = (() => {
    const t = result?.transcript_full || ''
    const firstSentence = t.match(/^[^.!?\n]+[.!?]?/)
    return firstSentence ? firstSentence[0].trim() : ''
  })()
  const [hook, setHook] = useState(initial)
  const [niche, setNiche] = useState(initialNiche || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!niche) return toast.error('Selecione o nicho')
    setSaving(true)
    const ok = await saveHookText(hook, result, niche)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '12px', padding: '20px 22px', maxWidth: '720px', width: '100%',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bookmark size={16} style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Salvar hook no Swipe</div>
          </div>
          <button onClick={onClose} style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
          Selecione e copie da transcrição abaixo o trecho que vai ser o hook, e cole no campo.
        </p>

        {/* Transcrição (read-only, selecionável) */}
        <div style={{
          flex: '0 1 200px', overflowY: 'auto', padding: '12px 14px', marginBottom: '12px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)',
          lineHeight: 1.65, whiteSpace: 'pre-wrap',
        }}>
          {result?.transcript_full || '(sem transcrição)'}
        </div>

        {/* Nicho (tag) */}
        <div style={{ marginBottom: '12px', maxWidth: '280px' }}>
          <SelectWithCreate label="Nicho *" value={niche} onChange={setNiche} kind="niche" placeholder="Escolha o nicho…" required />
        </div>

        {/* Hook editável */}
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '5px' }}>
          Hook
        </label>
        <textarea
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          placeholder="Cole aqui o trecho selecionado da transcrição"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
            borderRadius: '8px', padding: '10px 12px', fontSize: '13px',
            color: 'var(--text-primary)', fontFamily: 'var(--font)', lineHeight: 1.5,
          }}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !hook.trim()} className="tc-btn-primary">
            {saving ? 'Salvando...' : 'Salvar hook'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Salvar Vídeo Orgânico no Swipe ────────────────────
function SaveOrganicVideoModal({ result, niche: initialNiche, onClose }) {
  const sourceUrl = result?.source_url || result?.metadata?.source_url || ''
  const [link, setLink] = useState(sourceUrl)
  const [niche, setNiche] = useState(initialNiche || '')
  const [format, setFormat] = useState('')
  const [observations, setObservations] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!niche) return toast.error('Selecione um nicho')
    setSaving(true)
    try {
      const content = {
        title: result?.title || 'Vídeo orgânico',
        hook: result?.hook || '',
        body: result?.body || '',
        transcript_full: result?.transcript_full || '',
        source_video_url: link || null,
        niche, format,
        observations,
        metadata: result?.metadata || null,
      }
      await api.post('/swipes', {
        tag: 'organico',
        content: JSON.stringify(content),
        source: link || null,
      })
      toast.success('Vídeo orgânico salvo no Swipe!')
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Video size={18} style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Salvar vídeo orgânico no Swipe
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          {/* Link */}
          <div>
            <label className="tc-label">
              Link do vídeo {sourceUrl && <span style={{ color: 'var(--success-text)', fontSize: '10px', marginLeft: '4px' }}>● auto-preenchido</span>}
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                className="tc-input"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://tiktok.com/..."
                style={{ fontSize: '13px' }}
              />
              {link && (
                <a href={link} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', padding: '0 10px',
                  border: '1px solid var(--border-default)', borderRadius: '6px',
                  color: 'var(--text-muted)', textDecoration: 'none',
                }} title="Abrir vídeo">
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>

          {/* Nicho + Formato */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <SelectWithCreate label="Nicho" required value={niche} onChange={setNiche} kind="niche" placeholder="Selecione o nicho" />
            <SelectWithCreate label="Formato" value={format} onChange={setFormat} kind="format" placeholder="Selecione o formato" />
          </div>

          {/* Observações */}
          <div>
            <label className="tc-label">Observações</label>
            <textarea
              className="tc-input tc-textarea"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="O que viu de interessante neste vídeo (opcional)…"
              rows={3}
              style={{ fontSize: '13px', resize: 'vertical' }}
            />
          </div>

          {/* Preview do hook (read-only) */}
          {result?.hook && (
            <div style={{
              padding: '10px 12px', borderRadius: '8px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
                Hook detectado
              </div>
              {result.hook.length > 200 ? result.hook.slice(0, 200) + '…' : result.hook}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="tc-btn-primary">
            {saving ? 'Salvando...' : 'Salvar vídeo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Salvar Avatar no Swipe (link auto-preenchido) ─────
function SaveAvatarModal({ result, projectId, onClose }) {
  // Tenta extrair link (URL do vídeo orgânico)
  const sourceUrl = result?.source_url || result?.metadata?.source_url || ''

  const [link, setLink] = useState(sourceUrl)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!description.trim()) {
      return toast.error('Escreva a descrição do avatar')
    }
    setSaving(true)
    try {
      const content = {
        avatar: { description: description.trim() },
        source_video_url: link || null,
      }
      await api.post('/swipes', {
        tag: 'avatar',
        content: JSON.stringify(content),
        source: link || null,
      })
      toast.success('Avatar salvo no Swipe!')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar avatar')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { fontSize: '13px' }

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Salvar Avatar no Swipe
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          {/* Link do vídeo */}
          <div>
            <label className="tc-label">
              Link do vídeo {sourceUrl && <span style={{ color: 'var(--success-text)', fontSize: '10px', marginLeft: '4px' }}>● auto-preenchido</span>}
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                className="tc-input"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://tiktok.com/..."
                style={inputStyle}
              />
              {link && (
                <a href={link} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', padding: '0 10px',
                  border: '1px solid var(--border-default)', borderRadius: '6px',
                  color: 'var(--text-muted)', textDecoration: 'none',
                }} title="Abrir vídeo">
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>

          {/* Descrição livre do avatar */}
          <div>
            <label className="tc-label">Descrição do avatar *</label>
            <textarea
              className="tc-input tc-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Mulher 30+, no carro com bebê no colo, casual, fala empolgada"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="tc-btn-primary">
            {saving ? 'Salvando...' : 'Salvar avatar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Botões de ação pós-resultado ──────────────────────────────
function SaveActions({ result, projectId, niche }) {
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showHookModal, setShowHookModal] = useState(false)
  if (!result) return null
  const outlineBtn = {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
    background: 'transparent', border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
  }
  return (
    <>
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setShowVideoModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', background: 'transparent', border: '1px solid var(--success-text)', color: 'var(--success-text)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500 }}>
          <FileVideo size={12} /> Salvar vídeo no Swipe
        </button>
        <button onClick={() => setShowHookModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Bookmark size={12} /> Salvar hook no Swipe
        </button>
        <button onClick={() => setShowAvatarModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', background: 'transparent', border: '1px solid #a855f7', color: '#a855f7', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <User size={12} /> Salvar avatar no Swipe
        </button>
      </div>
      {showAvatarModal && (
        <SaveAvatarModal
          result={result}
          projectId={projectId}
          onClose={() => setShowAvatarModal(false)}
        />
      )}
      {showVideoModal && (
        <SaveOrganicVideoModal
          result={result}
          niche={niche}
          onClose={() => setShowVideoModal(false)}
        />
      )}
      {showHookModal && (
        <SaveHookModal
          result={result}
          niche={niche}
          onClose={() => setShowHookModal(false)}
        />
      )}
    </>
  )
}

// ── Resultado de uma transcrição (hook + body separados, sem IA) ──
function ResultCard({ result, projectId, niche }) {
  if (!result) return null
  const { title, hook, body, transcript_full, metadata } = result
  const orgName = (title || 'organico').replace(/[^a-zA-Z0-9À-ú _-]/g, '')

  return (
    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        <DownloadMenu filename={orgName} content={buildOrganicTxt(result)} />
      </div>
      {metadata && Object.keys(metadata).length > 0 && (
        <div className="tc-meta-grid">
          {[
            { label: 'Views',    val: metadata.views },
            { label: 'Likes',    val: metadata.likes },
            { label: 'Duração',  val: metadata.duration },
            { label: 'Autor',    val: metadata.author },
          ].filter(m => m.val && m.val !== '—').map(m => (
            <div key={m.label} className="tc-meta-item">
              <div className="tc-meta-val">{m.val}</div>
              <div className="tc-meta-label">{m.label}</div>
            </div>
          ))}
        </div>
      )}
      {hook && (
        <div>
          <div className="tc-section-title">Hook</div>
          <div className="tc-hook-box" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{hook}</div>
        </div>
      )}
      {body && (
        <div>
          <div className="tc-section-title">Body</div>
          <div className="tc-result-box" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{body}</div>
        </div>
      )}
      {transcript_full && (
        <details>
          <summary style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 0' }}>
            Ver transcrição completa
          </summary>
          <div className="tc-result-box" style={{ marginTop: '6px', fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {transcript_full}
          </div>
        </details>
      )}
      <SaveActions result={result} projectId={projectId} niche={niche} />
    </div>
  )
}

function JobStatus({ status, error, steps = ORGANIC_URL_STEPS, onSwitchToUpload }) {
  if (!status || status === 'done') return null
  if (error || status === 'error') {
    // Detecta erro especial do TikTok com restrição de vídeo específico
    const isVideoRestricted = error && error.includes('__TIKTOK_VIDEO_RESTRICTED__')
    const needsCookies = error && error.includes('__TIKTOK_NEEDS_COOKIES__')
    const cleanMsg = error
      ? error.replace('__TIKTOK_VIDEO_RESTRICTED__|', '').replace('__TIKTOK_NEEDS_COOKIES__|', '')
      : 'Erro desconhecido'

    return (
      <div style={{
        marginTop: '14px', padding: '12px 14px',
        background: 'rgba(255,62,94,0.06)', border: '1px solid rgba(255,62,94,0.2)',
        borderRadius: '8px', fontSize: '13px', color: 'var(--accent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>
            {isVideoRestricted ? '' : needsCookies ? '' : ''}
          </span>
          <div style={{ flex: 1, lineHeight: 1.5 }}>
            {isVideoRestricted ? (
              <>
                <strong>Vídeo com restrição</strong>
                <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {cleanMsg}
                </div>
              </>
            ) : (
              cleanMsg
            )}
          </div>
        </div>
        {(isVideoRestricted || needsCookies) && onSwitchToUpload && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={onSwitchToUpload}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                background: 'var(--accent)', border: 'none', color: '#fff',
                cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
              }}
            >
              Ir pra Upload de arquivo
            </button>
            <a
              href="https://snaptik.app/"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)',
                textDecoration: 'none', fontFamily: 'var(--font)', fontWeight: 500,
              }}
            >
              Baixar do TikTok (SnapTik)
            </a>
          </div>
        )}
      </div>
    )
  }
  return <ProgressBar currentStatus={status} steps={steps} />
}

// ── TAB principal: Links (1 ou vários) ───────────────────────
function TabLinkBatch({ niche, projectId, saveToMemory, translate, onSwitchToUpload }) {
  const [urls, setUrls] = usePersistedState('organic:urls', '')
  const [submitting, setSubmitting] = useState(false)

  // Jobs vivem no store GLOBAL → transcrição continua mesmo trocando de aba
  const jobs = useJobsStore((s) => s.jobs)
  const addJobs = useJobsStore((s) => s.addJobs)
  const clearKind = useJobsStore((s) => s.clearKind)

  const organicJobs = jobs.filter((j) => j.kind === 'organic')
  const doneJobs = organicJobs.filter((j) => j.status === 'done' && j.result)
  const activeCount = organicJobs.filter((j) => j.status !== 'done' && j.status !== 'error').length

  const handleSubmit = async (e) => {
    e.preventDefault()
    const list = urls.split('\n').map(u => u.trim()).filter(Boolean)
    if (list.length === 0) return
    setSubmitting(true)
    const newJobs = []
    for (const url of list) {
      try {
        const res = await api.post('/transcribe/url', { url, project_id: projectId, niche: niche || null, translate: !!translate })
        newJobs.push({
          id: res.data.job_id, kind: 'organic', endpoint: '/transcribe',
          label: url, projectId, niche, saveToMemory, translate,
        })
      } catch {
        toast.error(`Falha ao enviar: ${url}`)
      }
    }
    if (newJobs.length) {
      addJobs(newJobs)
      toast.success(`${newJobs.length} vídeo${newJobs.length > 1 ? 's' : ''} na fila — transcrevendo em background`)
      setUrls('')
    }
    setSubmitting(false)
  }

  const handleClear = async () => {
    if (doneJobs.length && !(await confirmAction({ title: 'Limpar os resultados?', message: 'Os resultados desta lista vão sair da tela.', confirmLabel: 'Limpar' }))) return
    clearKind('organic')
    setUrls('')
  }

  return (
    <>
      <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Cole o link (TikTok, Instagram, YouTube). Pra vários, cole um por linha.
        {activeCount > 0 && <> · <strong style={{ color: 'var(--accent)' }}>{activeCount} transcrevendo em background</strong> (pode trocar de aba)</>}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
        <textarea className="tc-input tc-textarea" placeholder={'https://www.tiktok.com/@...'} value={urls} onChange={e => setUrls(e.target.value)} rows={5} required />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="tc-btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Transcrever'}
          </button>
          {(urls || organicJobs.length > 0) && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Nova transcrição
            </button>
          )}
        </div>
      </form>
      {doneJobs.length > 0 && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>{doneJobs.length} vídeo{doneJobs.length !== 1 ? 's' : ''} processado{doneJobs.length !== 1 ? 's' : ''}</div>
          {doneJobs.map((j, i) => (
            <div key={j.id} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: i > 0 ? '20px' : 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>#{i + 1}</div>
              <ResultCard result={j.result} projectId={projectId} niche={niche} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────

export default function OrganicPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const [niche, setNiche] = useState('')
  const [saveToMemory, setSaveToMemory] = useState(false)
  const [translate, setTranslate] = useState(false)

  // Sincroniza nicho com o projeto ativo
  useEffect(() => {
    setNiche(activeProject?.nicho || '')
  }, [activeProject?.id, activeProject?.nicho])

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Vídeos <span style={{ color: 'var(--accent)' }}>Orgânicos</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Cole 1 ou vários links (um por linha) e transcreva.
        </p>
      </div>

      {/* Nicho + toggle de memória */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '20px' }}>
        <div style={{ minWidth: '240px' }}>
          <label className="tc-label">
            Nicho (opcional)
            {activeProject?.nicho && (
              <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--accent)', fontWeight: 500 }}>
                · sincronizado com "{activeProject.name}"
              </span>
            )}
          </label>
          <NicheSelect value={niche} onChange={setNiche} />
        </div>
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
      </div>

      <TabLinkBatch niche={niche} projectId={activeProject?.id} saveToMemory={saveToMemory} translate={translate} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
