import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Upload, X, FileText, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import NicheSelect from '../components/NicheSelect'
import { PRODUCT_TYPES, FUNNEL_TYPES, funnelHasVSL } from '../constants/offer'

const isDemo = (user) => user?.id === 'demo'

const DOC_ACCEPT = '.pdf,.docx,.txt,.md'
const VSL_ACCEPT = 'audio/*,video/*,.mp3,.mp4,.wav,.m4a,.mov,.webm,.txt,.md'

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({ step }) {
  const labels = ['Identidade', 'Alimentar a IA', 'Destilação']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
      {labels.map((label, i) => {
        const n = i + 1
        const active = step === n
        const done = step > n
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
              background: active ? 'var(--accent)' : done ? 'rgba(255,62,94,0.1)' : 'var(--bg-active)',
              color: active ? '#fff' : done ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${active || done ? 'var(--accent)' : 'var(--border-default)'}`,
            }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'rgba(255,255,255,0.25)' : 'transparent', fontSize: '11px',
              }}>
                {done ? <Check size={12} /> : n}
              </span>
              {label}
            </div>
            {i < labels.length - 1 && (
              <div style={{ width: '20px', height: '1px', background: 'var(--border-default)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── File list item ─────────────────────────────────────────────────────────

function FileChip({ name, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 12px', borderRadius: '8px',
      background: 'var(--bg-active)', border: '1px solid var(--border-default)',
      fontSize: '12px', color: 'var(--text-primary)',
    }}>
      <FileText size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <button type="button" onClick={onRemove} style={{
        background: 'transparent', border: 'none', color: 'var(--text-muted)',
        cursor: 'pointer', display: 'flex', padding: 0,
      }}><X size={13} /></button>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────

export default function ProjectCreatePage() {
  const navigate = useNavigate()
  const { user, setActiveProject } = useAppStore()
  const demo = isDemo(user)

  const [step, setStep] = useState(1)

  // Step 1 — identidade
  const [offerName, setOfferName] = useState('')
  const [niche, setNiche] = useState('')
  const [productType, setProductType] = useState('')
  const [funnelType, setFunnelType] = useState('')

  // Step 2 — alimentar
  const [files, setFiles] = useState([])           // File[]
  const [researchText, setResearchText] = useState('') // pesquisa colada (vira .txt)
  const [vslFile, setVslFile] = useState(null)     // File | null
  const [vslTranscript, setVslTranscript] = useState('')
  const docInputRef = useRef(null)
  const vslInputRef = useRef(null)

  // Step 3 — destilação
  const [busy, setBusy] = useState(false)
  const [statusText, setStatusText] = useState('')

  const showVsl = funnelHasVSL(funnelType)

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || [])
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...incoming.filter((f) => !seen.has(f.name + f.size))]
    })
  }

  const canNext1 = offerName.trim() && productType && funnelType
  // Pesquisa é obrigatória — é o que a IA usa pra saber o que escrever.
  // Mas é flexível: aceita arquivo OU texto colado OU VSL.
  const hasResearch = files.length > 0 || researchText.trim() || vslFile || vslTranscript.trim()

  const pollBuild = async (jobId) => {
    for (let i = 0; i < 240; i++) {
      try {
        const res = await api.get(`/offers/build/${jobId}`)
        const s = res.data.status
        if (s === 'transcribing') setStatusText('Transcrevendo a VSL…')
        else if (s === 'analyzing') setStatusText('Destilando as pesquisas (isso é o que faz a diferença)…')
        else if (s === 'saving') setStatusText('Salvando o dossiê…')
        else if (s === 'queued') setStatusText('Na fila…')
        else if (s === 'done') return res.data.result
        else if (s === 'error') throw new Error(res.data.error || 'Erro na destilação')
      } catch (e) {
        if (e.response?.status === 404) throw new Error('Job expirou')
        throw e
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new Error('Timeout — a destilação demorou demais')
  }

  const handleCreate = async () => {
    if (demo) {
      const proj = {
        id: crypto.randomUUID(), name: offerName.trim(), nicho: niche || null,
        created_at: new Date().toISOString(),
      }
      setActiveProject(proj)
      toast.success('Oferta criada! (modo demo — sem dossiê)')
      navigate('/projects')
      return
    }

    setStep(3)
    setBusy(true)
    setStatusText('Criando o projeto…')
    try {
      // 1) cria o projeto (= oferta)
      const projRes = await api.post('/projects', {
        name: offerName.trim(),
        nicho: niche || null,
      })
      const project = projRes.data
      if (!project?.id) throw new Error('Não consegui criar o projeto')
      setActiveProject(project)

      // 2) Dispara a construção do dossiê (pesquisa é obrigatória)
      setStatusText('Enviando pesquisas…')
      const form = new FormData()
      form.append('project_id', project.id)
      form.append('offer_name', offerName.trim())
      form.append('niche', niche || '')
      form.append('product_type', productType)
      form.append('funnel_type', funnelType)
      files.forEach((f) => form.append('files', f))
      // Pesquisa colada → vira um .txt que o backend já sabe parsear.
      if (researchText.trim()) {
        form.append('files', new File([researchText.trim()], 'pesquisa-colada.txt', { type: 'text/plain' }))
      }
      if (showVsl) {
        if (vslFile) form.append('vsl_file', vslFile)
        if (vslTranscript.trim()) form.append('vsl_transcript', vslTranscript.trim())
      }

      const startRes = await api.post('/offers/build', form)
      await pollBuild(startRes.data.job_id)

      toast.success('Projeto criado — a IA já tem o dossiê completo!')
      navigate(`/briefings?project=${project.id}`)
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Erro ao criar o projeto')
      setBusy(false)
      setStep(2)
    }
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <button
        type="button"
        onClick={() => navigate('/projects')}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px',
          padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
          background: 'transparent', border: '1px solid var(--border-default)',
          color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
        }}
      >
        <ArrowLeft size={12} /> Voltar
      </button>

      <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
        Novo <span style={{ color: 'var(--accent)' }}>projeto</span>
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '20px' }}>
        Cada projeto é uma oferta. Defina o básico, suba as pesquisas, e a IA monta o dossiê
        completo que vai guiar toda a copy.
      </p>

      <Stepper step={step} />

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
        }}>
          <div>
            <label className="tc-label">Nome do produto / oferta *</label>
            <input
              className="tc-input"
              value={offerName}
              onChange={(e) => setOfferName(e.target.value)}
              placeholder="ex: Gelatina Japonesa"
              autoFocus
              style={{ fontSize: '14px', fontWeight: 500 }}
            />
          </div>
          <div>
            <label className="tc-label">Nicho</label>
            <NicheSelect value={niche} onChange={setNiche} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="tc-label">Tipo de produto *</label>
              <select
                className="tc-input"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                style={{ width: '100%', fontSize: '13px' }}
              >
                <option value="">Selecione…</option>
                {PRODUCT_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="tc-label">Tipo de funil *</label>
              <select
                className="tc-input"
                value={funnelType}
                onChange={(e) => setFunnelType(e.target.value)}
                style={{ width: '100%', fontSize: '13px' }}
              >
                <option value="">Selecione…</option>
                {FUNNEL_TYPES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              className="tc-btn-primary"
              disabled={!canNext1}
              onClick={() => setStep(2)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: canNext1 ? 1 : 0.5 }}
            >
              Continuar <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px',
        }}>
          {/* Pesquisas */}
          <div>
            <label className="tc-label">Pesquisas da oferta</label>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
              É daqui que a IA tira o que vai escrever — sem pesquisa ela não tem matéria-prima.
              Suba os documentos (avatar, dores, provas, voz do cliente, mecanismos…) em PDF, DOCX, TXT ou MD,
              ou cole o texto abaixo. A IA preserva os pontos-chave — não é só um resumo.
            </div>
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
                justifyContent: 'center', padding: '14px', borderRadius: '8px',
                background: 'transparent', border: '1px dashed var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '13px',
              }}
            >
              <Upload size={14} /> Selecionar arquivos
            </button>
            <input
              ref={docInputRef}
              type="file"
              multiple
              accept={DOC_ACCEPT}
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
              style={{ display: 'none' }}
            />
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                {files.map((f, i) => (
                  <FileChip key={f.name + f.size} name={f.name}
                    onRemove={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
                ))}
              </div>
            )}

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '12px 0 6px' }}>
              ou cole a pesquisa aqui (pra quem não tem arquivo na mão):
            </div>
            <textarea
              className="tc-input tc-textarea"
              value={researchText}
              onChange={(e) => setResearchText(e.target.value)}
              rows={5}
              placeholder="Cole aqui sua pesquisa: avatar, dores, desejos, objeções, provas, voz do cliente, mecanismo…"
              style={{ resize: 'vertical', fontSize: '13px', width: '100%', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
          </div>

          {/* VSL (condicional) */}
          {showVsl && (
            <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              <label className="tc-label">Transcrição da VSL</label>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
                Esse funil usa VSL. Suba o vídeo/áudio (a IA transcreve) ou cole a transcrição.
              </div>
              {vslFile ? (
                <FileChip name={vslFile.name} onRemove={() => setVslFile(null)} />
              ) : (
                <button
                  type="button"
                  onClick={() => vslInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
                    justifyContent: 'center', padding: '12px', borderRadius: '8px',
                    background: 'transparent', border: '1px dashed var(--border-default)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '13px',
                  }}
                >
                  <Upload size={14} /> Subir VSL (áudio/vídeo)
                </button>
              )}
              <input
                ref={vslInputRef}
                type="file"
                accept={VSL_ACCEPT}
                onChange={(e) => { setVslFile(e.target.files?.[0] || null); e.target.value = '' }}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 6px' }}>ou cole a transcrição:</div>
              <textarea
                className="tc-input tc-textarea"
                value={vslTranscript}
                onChange={(e) => setVslTranscript(e.target.value)}
                rows={4}
                placeholder="Cole aqui a transcrição da VSL…"
                style={{ resize: 'vertical', fontSize: '13px', width: '100%', boxSizing: 'border-box', lineHeight: 1.5 }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
              }}
            >
              <ArrowLeft size={14} /> Voltar
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {!hasResearch && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.4 }}>
                  Suba ou cole ao menos uma pesquisa pra continuar
                </span>
              )}
              <button
                type="button"
                className="tc-btn-primary"
                onClick={handleCreate}
                disabled={!hasResearch}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                  opacity: hasResearch ? 1 : 0.5,
                  cursor: hasResearch ? 'pointer' : 'not-allowed',
                }}
              >
                <Sparkles size={14} /> Criar projeto e destilar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '10px', padding: '40px 24px', textAlign: 'center',
        }}>
          {busy ? (
            <>
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--accent)' }} />
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Montando o dossiê da oferta…
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {statusText || 'Processando…'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '14px' }}>
                Pode levar 1-2 minutos. Não feche a página.
              </div>
            </>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Pronto.</div>
          )}
        </div>
      )}
    </div>
  )
}
