import { useState } from 'react'
import { Sparkles, Loader2, Check, X, RefreshCw, ChevronRight, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

/**
 * Botão "✨ Sugerir" que aparece no header de campos no modo Híbrido.
 *
 * Para o campo "hook" abre um MENU de estratégias (mapa mental dos 3 modos):
 *  01 Modelar o hook da Comunicação (orgânico)
 *  02 Modelar hooks do swipe (mesmo nicho)
 *  03 Adaptar hook do swipe de outro nicho
 *  04 Usar um hook validado das minhas copys → gerar semelhante OU usar o mesmo
 *
 * Para os outros campos (ex: body) gera direto, como antes.
 *
 * Props:
 *  - field, currentValue, buildContext, onApply, label, n, compact
 */

const HOOK_STRATEGIES = [
  {
    key: 'organico',
    n: 3,
    title: 'Inspirado no orgânico validado',
    desc: 'Parte do seu briefing (ângulo, avatar, oferta) e modela a estrutura do hook do orgânico validado.',
  },
  {
    key: 'swipe_same',
    n: 3,
    title: 'Modelar hooks do swipe (mesmo nicho)',
    desc: 'Modela hooks validados do swipe deste nicho. Você escolhe: de anúncios ou de orgânicos.',
  },
  {
    key: 'swipe_other',
    n: 3,
    title: 'Adaptar hook de outro nicho',
    desc: 'Pega um hook que funcionou em outro nicho e adapta pro seu (com briefing + pesquisa).',
  },
  {
    key: 'validated',
    n: 3,
    title: 'Usar um hook validado das minhas copys',
    desc: 'Escolhe um hook das suas copys e gera semelhante (melhorado) ou usa o mesmo.',
  },
]

export default function SuggestionButton({ field, currentValue, buildContext, onApply, label = 'Sugerir', n = 3, compact = false }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [extraInstruction, setExtraInstruction] = useState('')
  // Fluxo do hook: 'menu' → estratégia | 'swipe_source' → escolhe ad/orgânico | 'validated' → escolhe hook | 'results'
  const [stage, setStage] = useState('menu')
  const [strategy, setStrategy] = useState(null)
  const [validatedHooks, setValidatedHooks] = useState([])
  const [selectedHook, setSelectedHook] = useState(null)
  const [swipeSource, setSwipeSource] = useState(null)  // 'ad' | 'organic' (estratégia swipe_same)

  const isHook = field === 'hook'

  const callSuggest = async (extra = {}) => {
    setLoading(true)
    try {
      const ctx = buildContext() || {}
      const res = await api.post('/ai/suggest-field', {
        field,
        current_value: currentValue || '',
        instruction: extraInstruction || null,
        n: extra.n ?? n,
        ...ctx,
        ...extra,
      })
      return res.data.suggestions || []
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao gerar sugestões')
      return null
    } finally {
      setLoading(false)
    }
  }

  // ── Body (e outros): gera direto ──
  const handleOpen = () => {
    setOpen(true)
    setSuggestions([])
    setExtraInstruction('')
    setSelectedHook(null)
    setValidatedHooks([])
    setSwipeSource(null)
    if (isHook) {
      setStage('menu')
      setStrategy(null)
    } else {
      // Body (e outros): NÃO gera na hora — deixa o copy escrever a instrução
      // (ex: "mantenha a primeira frase") e só então clicar em Gerar.
      setStage('results')
      setStrategy(null)
    }
  }

  const fetchDirect = async () => {
    const s = await callSuggest()
    if (s) setSuggestions(s)
  }

  // ── Hook: escolheu uma estratégia no menu ──
  const pickStrategy = async (strat) => {
    setStrategy(strat)
    if (strat.key === 'swipe_same') {
      // Sub-passo: escolher a ORIGEM dos hooks do swipe (anúncios ou orgânico).
      setSwipeSource(null)
      setStage('swipe_source')
      return
    }
    if (strat.key === 'validated') {
      // Busca os hooks validados pra o usuário escolher
      setStage('validated')
      setLoading(true)
      try {
        const ctx = buildContext() || {}
        const res = await api.get('/ai/validated-hooks', { params: { project_id: ctx.project_id } })
        setValidatedHooks(res.data.hooks || [])
      } catch {
        setValidatedHooks([])
      } finally {
        setLoading(false)
      }
      return
    }
    // Demais estratégias geram direto
    setStage('results')
    const s = await callSuggest({ strategy: strat.key, n: strat.n })
    if (s) setSuggestions(s)
  }

  // ── Swipe (mesmo nicho): escolheu a origem (ad/orgânico) → gera ──
  const pickSwipeSource = async (src) => {
    setSwipeSource(src)
    setStage('results')
    const s = await callSuggest({ strategy: 'swipe_same', swipe_source: src, n: strategy?.n ?? 3 })
    if (s) setSuggestions(s)
  }

  // ── Hook validado: gerar semelhante ──
  const generateSimilar = async () => {
    setStage('results')
    const s = await callSuggest({ strategy: 'validated', validated_mode: 'similar', selected_hook: selectedHook, n: strategy?.n ?? 3 })
    if (s) setSuggestions(s)
  }

  // ── Hook validado: usar o mesmo (aplica direto) ──
  const useSame = () => {
    if (selectedHook) { onApply(selectedHook); setOpen(false) }
  }

  const refetch = () => {
    if (!isHook) return fetchDirect()
    if (strategy?.key === 'validated') return generateSimilar()
    if (strategy?.key === 'swipe_same') return callSuggest({ strategy: 'swipe_same', swipe_source: swipeSource, n: strategy.n }).then(s => { if (s) setSuggestions(s) })
    if (strategy) return callSuggest({ strategy: strategy.key, n: strategy.n }).then(s => { if (s) setSuggestions(s) })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Sugerir com IA"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: compact ? '3px 7px' : '4px 9px',
          borderRadius: '6px', fontSize: compact ? '10px' : '11px',
          background: 'transparent', border: '1px solid #8b5cf6',
          color: '#8b5cf6', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
        }}
      >
        <Sparkles size={compact ? 10 : 11} />
        {!compact && label}
      </button>

      {open && (
        <SuggestionsModal
          field={field}
          isHook={isHook}
          stage={stage}
          strategy={strategy}
          loading={loading}
          suggestions={suggestions}
          validatedHooks={validatedHooks}
          selectedHook={selectedHook}
          extraInstruction={extraInstruction}
          onExtraInstructionChange={setExtraInstruction}
          onPickStrategy={pickStrategy}
          onPickSwipeSource={pickSwipeSource}
          onSelectHook={setSelectedHook}
          onGenerateSimilar={generateSimilar}
          onUseSame={useSame}
          onBackToMenu={() => { setStage('menu'); setStrategy(null); setSuggestions([]); setSelectedHook(null); setSwipeSource(null) }}
          onRefetch={refetch}
          onApply={(s) => { onApply(s); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function SuggestionsModal({
  field, isHook, stage, strategy, loading, suggestions, validatedHooks, selectedHook,
  extraInstruction, onExtraInstructionChange, onPickStrategy, onPickSwipeSource, onSelectHook,
  onGenerateSimilar, onUseSame, onBackToMenu, onRefetch, onApply, onClose,
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '12px', width: '100%', maxWidth: '640px', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isHook && stage !== 'menu' && (
              <button onClick={onBackToMenu} title="Voltar" style={{
                background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center',
              }}><ArrowLeft size={16} /></button>
            )}
            <Sparkles size={16} style={{ color: '#8b5cf6' }} />
            <div style={{ fontSize: '14px', fontWeight: 600 }}>
              {isHook && stage === 'menu'
                ? 'Como você quer gerar o gancho?'
                : isHook && stage === 'swipe_source'
                  ? 'De onde modelar os hooks?'
                  : isHook && strategy
                    ? strategy.title
                    : <>Sugestões pra <span style={{ color: '#8b5cf6' }}>{field}</span></>}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          }}><X size={16} /></button>
        </div>

        {/* ── MENU de estratégias (só hook) ── */}
        {isHook && stage === 'menu' && (
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            {HOOK_STRATEGIES.map((s, i) => (
              <button
                key={s.key}
                onClick={() => onPickStrategy(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                <div style={{
                  flexShrink: 0, width: '28px', height: '28px', borderRadius: '7px',
                  background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700,
                }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>{s.desc}</div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {/* ── SUB-MENU: origem dos hooks do swipe (opção 02) ── */}
        {isHook && stage === 'swipe_source' && (
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
              Modelar a estrutura dos hooks salvos no Swipe deste nicho, vindos de:
            </div>
            {[
              { src: 'ad', emoji: '📣', title: 'Anúncios', desc: 'Hooks que você salvou de anúncios validados.' },
              { src: 'organic', emoji: '🎥', title: 'Orgânicos', desc: 'Hooks que você salvou de vídeos orgânicos validados.' },
            ].map(o => (
              <button
                key={o.src}
                onClick={() => onPickSwipeSource(o.src)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', fontFamily: 'var(--font)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              >
                <div style={{ fontSize: '20px', flexShrink: 0 }}>{o.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>{o.desc}</div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {/* ── ESCOLHER hook validado (opção 04) ── */}
        {isHook && stage === 'validated' && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {loading ? (
                <Spinner text="Carregando seus hooks…" />
              ) : validatedHooks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Nenhum hook validado encontrado nas suas copys ainda.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {validatedHooks.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => onSelectHook(h.hook)}
                      style={{
                        textAlign: 'left', background: selectedHook === h.hook ? 'rgba(139,92,246,0.12)' : 'var(--bg-elevated)',
                        border: `1px solid ${selectedHook === h.hook ? '#8b5cf6' : 'var(--border-default)'}`,
                        borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontFamily: 'var(--font)',
                      }}
                    >
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{h.hook}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{h.draft_title}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedHook && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  className="tc-input"
                  value={extraInstruction}
                  onChange={(e) => onExtraInstructionChange(e.target.value)}
                  placeholder='Como melhorar? Ex: "mais agressivo", "mais curto"…'
                  style={{ fontSize: '12px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={onGenerateSimilar} style={primaryBtn(true)}>
                    <Sparkles size={12} /> Gerar semelhante
                  </button>
                  <button onClick={onUseSame} style={primaryBtn(false)}>
                    <Check size={12} /> Usar o mesmo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RESULTADOS ── */}
        {(!isHook || stage === 'results') && (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                className="tc-input"
                value={extraInstruction}
                onChange={(e) => onExtraInstructionChange(e.target.value)}
                placeholder='O que a IA deve fazer/manter? Ex: "mantenha a 1ª frase", "mais específico", "sem emojis"…'
                style={{ flex: 1, fontSize: '12px' }}
                onKeyDown={(e) => { if (e.key === 'Enter') onRefetch() }}
                autoFocus
              />
              <button
                onClick={onRefetch}
                disabled={loading}
                style={{
                  padding: '7px 12px', borderRadius: '6px', fontSize: '12px',
                  background: '#8b5cf6', border: 'none', color: '#fff',
                  cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500, whiteSpace: 'nowrap',
                }}
              >
                {loading
                  ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</>
                  : <><RefreshCw size={11} /> {suggestions.length ? 'Gerar de novo' : 'Gerar'}</>
                }
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {loading && suggestions.length === 0 ? (
                <Spinner text="Gerando sugestões…" />
              ) : suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                  <Sparkles size={20} style={{ display: 'block', margin: '0 auto 10px', color: '#8b5cf6', opacity: 0.7 }} />
                  Escreva acima o que a IA deve fazer ou <strong>manter</strong> do texto (opcional) e clique em <strong>Gerar</strong>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {suggestions.map((s, i) => (
                    <div key={i} style={{
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                      borderRadius: '8px', padding: '12px 14px',
                      display: 'flex', flexDirection: 'column', gap: '8px',
                    }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {s}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => onApply(s)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '5px 12px', borderRadius: '6px', fontSize: '11px',
                            background: '#8b5cf6', border: 'none', color: '#fff',
                            cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
                          }}
                        >
                          <Check size={11} /> Usar esta
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Spinner({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 10px', color: '#8b5cf6' }} />
      {text}
    </div>
  )
}

function primaryBtn(filled) {
  return {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '9px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
    background: filled ? '#8b5cf6' : 'transparent',
    border: filled ? 'none' : '1px solid #8b5cf6',
    color: filled ? '#fff' : '#8b5cf6',
    cursor: 'pointer', fontFamily: 'var(--font)',
  }
}
