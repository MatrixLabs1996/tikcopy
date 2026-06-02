import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, CheckSquare, Square, DoorOpen, TrendingUp, Lightbulb, ArrowRight, Scale, AlertTriangle, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import NicheSelect from '../components/NicheSelect'
import SevenLayers from '../components/SevenLayers'

function parseContent(s) {
  try { return typeof s.content === 'string' ? JSON.parse(s.content) : (s.content || {}) } catch { return {} }
}

const PROB_COLOR = { 'Alta': '#22c55e', 'Média': '#f59e0b', 'Exploratória': '#8b5cf6' }

export default function BrainstormPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const navigate = useNavigate()

  const [ads, setAds] = useState([])
  const [niche, setNiche] = useState('')
  const [selected, setSelected] = useState({})   // { swipeId: true }
  const [loadingAds, setLoadingAds] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)
  const [council, setCouncil] = useState(null)
  const [councilLoading, setCouncilLoading] = useState(false)

  useEffect(() => {
    setLoadingAds(true)
    api.get('/swipes?tag=ad')
      .then(r => setAds((r.data || []).map(s => ({ ...s, _c: parseContent(s) }))))
      .catch(() => setAds([]))
      .finally(() => setLoadingAds(false))
  }, [])

  const niches = useMemo(() => {
    const set = new Set()
    ads.forEach(a => { if (a._c.niche) set.add(a._c.niche) })
    return [...set]
  }, [ads])

  const visibleAds = useMemo(
    () => (niche ? ads.filter(a => a._c.niche === niche) : ads),
    [ads, niche]
  )

  const selectedIds = Object.keys(selected).filter(id => selected[id])

  const toggle = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  const selectAllVisible = () => {
    const next = { ...selected }
    visibleAds.forEach(a => { next[a.id] = true })
    setSelected(next)
  }
  const clearSel = () => setSelected({})

  const generate = async () => {
    if (selectedIds.length === 0) return toast.error('Selecione ao menos 1 anúncio.')
    setGenerating(true)
    setResult(null)
    setCouncil(null)
    try {
      const res = await api.post('/brainstorm', {
        project_id: activeProject?.id || null,
        swipe_ids: selectedIds,
        niche: niche || null,
      })
      setResult(res.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao gerar brainstorm.')
    } finally {
      setGenerating(false)
    }
  }

  const runCouncil = async () => {
    if (!result?.conceitos?.length) return
    setCouncilLoading(true)
    setCouncil(null)
    try {
      const res = await api.post('/brainstorm/council', {
        project_id: activeProject?.id || null,
        concepts: result.conceitos,
        niche: niche || result?._meta?.niche || null,
      })
      setCouncil(res.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao chamar o conselho.')
    } finally {
      setCouncilLoading(false)
    }
  }

  const useConcept = (concept) => {
    sessionStorage.setItem('brainstorm_concept', JSON.stringify(concept))
    toast.success('Conceito carregado no Escrever!')
    navigate('/criar-copy')
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 28px' }}>
      <style>{`.tc-spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Sparkles size={22} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Brainstorm ADS</h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
        Selecione anúncios do seu Swipe. A IA cruza as <b>7 Camadas Macro</b> com as <b>5 Portas de Entrada</b> (Leilões
        Fantasmas) pra achar padrões, lacunas e gerar conceitos novos que escapam do leilão lotado.
      </p>

      {/* Seleção de anúncios */}
      <div className="tc-card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '200px', flex: 1 }}>
            <NicheSelect value={niche} onChange={setNiche} placeholder="Todos os nichos" allowCreate={false} />
          </div>
          <button onClick={selectAllVisible} style={btnGhost}>Selecionar todos</button>
          {selectedIds.length > 0 && <button onClick={clearSel} style={btnGhost}>Limpar ({selectedIds.length})</button>}
        </div>

        {loadingAds ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            <Loader2 size={18} className="tc-spin" /> Carregando anúncios…
          </div>
        ) : visibleAds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Nenhum anúncio no Swipe {niche ? `do nicho "${niche}"` : ''}. Salve anúncios pelo Swipe File primeiro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
            {visibleAds.map(a => {
              const on = !!selected[a.id]
              const hook = a._c.hook_written || a._c.hook || ''
              const has7 = !!a._c.seven_layers
              return (
                <div
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                    borderRadius: '8px', cursor: 'pointer',
                    background: on ? 'rgba(255,62,94,0.07)' : 'var(--bg-elevated)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {on ? <CheckSquare size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
                      : <Square size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '1px' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {a._c.title || 'Anúncio'}
                      {a._c.niche && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}> · {a._c.niche}</span>}
                      {has7 && <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600, marginLeft: '6px' }}>7 camadas ✓</span>}
                    </div>
                    {hook && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hook}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={generate}
          disabled={generating || selectedIds.length === 0}
          className="tc-btn-primary"
          style={{ marginTop: '14px', width: '100%', padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: (generating || selectedIds.length === 0) ? 0.6 : 1 }}
        >
          {generating ? <><Loader2 size={15} className="tc-spin" /> Gerando brainstorm…</> : <><Sparkles size={15} /> Gerar Brainstorm ({selectedIds.length})</>}
        </button>
      </div>

      {/* Resultado */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Padrões */}
          {result.padroes && (
            <div className="tc-card" style={{ padding: '16px', borderLeft: '3px solid #22c55e' }}>
              <SectionHead icon={TrendingUp} color="#22c55e" label="Padrões observados (o que se repete)" />
              {result.padroes.resumo && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '10px' }}>{result.padroes.resumo}</p>}
              <Chips label="Portas usadas" items={result.padroes.portas_usadas} />
              <Chips label="Estruturas" items={result.padroes.estruturas} />
              <Chips label="Ângulos" items={result.padroes.angulos} />
              <Chips label="Avatares" items={result.padroes.avatares} />
              <Chips label="Temas" items={result.padroes.temas} />
              <Chips label="Níveis" items={result.padroes.niveis} />
            </div>
          )}

          {/* Lacunas */}
          {result.lacunas && (
            <div className="tc-card" style={{ padding: '16px', borderLeft: '3px solid #f59e0b' }}>
              <SectionHead icon={DoorOpen} color="#f59e0b" label="Lacunas (leilões limpos a explorar)" />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{result.lacunas}</p>
            </div>
          )}

          {/* Conceitos */}
          {(result.conceitos || []).length > 0 && (
            <div>
              <SectionHead icon={Lightbulb} color="var(--accent)" label={`Conceitos novos (${result.conceitos.length})`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {result.conceitos.map((c, i) => (
                  <div key={i} className="tc-card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.titulo}</div>
                        <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginTop: '2px' }}>{c.porta}</div>
                      </div>
                      {c.probabilidade && (
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', whiteSpace: 'nowrap', color: PROB_COLOR[c.probabilidade] || '#888', border: `1px solid ${PROB_COLOR[c.probabilidade] || '#888'}`, background: 'transparent' }}>
                          {c.probabilidade}
                        </span>
                      )}
                    </div>
                    {c.leilao_que_escapa && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}><b style={{ color: 'var(--text-muted)' }}>Leilão que escapa:</b> {c.leilao_que_escapa}</div>}
                    {c.racional && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '12px' }}>{c.racional}</div>}
                    {c.camadas && <SevenLayers data={c.camadas} />}
                    <button onClick={() => useConcept(c)} className="tc-btn-primary" style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Usar no Escrever <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Conselho dos 5 — pressão opcional sobre os conceitos */}
              {!council && (
                <button
                  onClick={runCouncil}
                  disabled={councilLoading}
                  style={{ marginTop: '16px', width: '100%', padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6', color: '#8b5cf6', cursor: councilLoading ? 'wait' : 'pointer', fontFamily: 'var(--font)' }}
                >
                  {councilLoading ? <><Loader2 size={15} className="tc-spin" /> Conselho debatendo…</> : <><Scale size={15} /> Passar pelo conselho dos 5</>}
                </button>
              )}

              {council && <CouncilVerdict council={council} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CouncilVerdict({ council }) {
  return (
    <div style={{ marginTop: '20px', border: '1px solid #8b5cf6', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.3)' }}>
        <Scale size={16} style={{ color: '#8b5cf6' }} />
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#8b5cf6' }}>Veredito do Conselho dos 5</span>
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {council.veredito && (
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6, padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: '8px', borderLeft: '3px solid #8b5cf6' }}>
            {council.veredito}
          </div>
        )}

        {(council.top_apostas || []).length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#22c55e', marginBottom: '8px' }}>🎯 Apostas do conselho</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {council.top_apostas.map((a, i) => (
                <div key={i} style={{ border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px 14px', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{a.conceito}</span>
                    {a.nota && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color: '#22c55e', border: '1px solid #22c55e' }}>{a.nota}</span>}
                  </div>
                  {a.por_que && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '8px' }}>{a.por_que}</div>}
                  {(a.lentes || []).map((l, j) => (
                    <div key={j} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '3px' }}>
                      <b style={{ color: 'var(--text-muted)' }}>{l.conselheiro}:</b> {l.comentario}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {(council.riscos || []).length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#ef4444', marginBottom: '8px' }}>
              <AlertTriangle size={13} /> Riscos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {council.riscos.map((r, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <b style={{ color: 'var(--text-primary)' }}>{r.conceito}</b> <span style={{ color: 'var(--text-muted)' }}>({r.conselheiro})</span>: {r.alerta}
                </div>
              ))}
            </div>
          </div>
        )}

        {(council.ajustes || []).length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b', marginBottom: '8px' }}>
              <Wrench size={13} /> Ajustes sugeridos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {council.ajustes.map((a, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <b style={{ color: 'var(--text-primary)' }}>{a.conceito}:</b> {a.ajuste}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const btnGhost = {
  padding: '7px 12px', borderRadius: '6px', fontSize: '12px', background: 'transparent',
  border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
}

function SectionHead({ icon: Icon, color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
      <Icon size={16} style={{ color }} />
      <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color }}>{label}</span>
    </div>
  )
}

function Chips({ label, items }) {
  if (!items || !items.length) return null
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, minWidth: '70px' }}>{label}:</span>
      {items.map((it, i) => (
        <span key={i} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{it}</span>
      ))}
    </div>
  )
}
