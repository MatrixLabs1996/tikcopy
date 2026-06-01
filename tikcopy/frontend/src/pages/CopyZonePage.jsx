import { useState, useEffect, useRef } from 'react'
import { Brain, Upload, FileText, Trash2, Eye, EyeOff, FileVideo, Megaphone, FileType, Download, FolderArchive, BookOpen, Save, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import { confirmAction } from '../stores/useConfirmStore'

// ─── Tipos de memória ────────────────────────────────────────────────────────

// ─── Template padrão de instruções (exibido pra quem nunca preencheu) ──────

const INSTRUCTIONS_TEMPLATE = `# Quem você é
Você é um copywriter especialista em resposta direta, especialista em [NICHO].

# Tom de voz
- Direto, sem rodeios
- Use linguagem coloquial do avatar (gírias do nicho quando fizer sentido)
- Evite jargão técnico — explique como se fosse pra um amigo
- Frases curtas. Pausas pra impacto.

# Avatar
- [Descreva quem é o cliente ideal: idade, gênero, dores, desejos]
- [Vocabulário que ele usa]
- [Crenças que ele tem]

# Regras de hooks
- Sempre comece com pergunta, paradoxo, ou afirmação chocante
- Máximo 1 frase
- Use números específicos quando possível
- Nunca use clichês como "Você sabia que..."

# Regras de body
- Story primeiro, mecanismo depois
- Prove com testemunhos ou números antes de fazer oferta
- CTA com urgência mas sem agressividade

# O que NÃO fazer
- Não use emojis (a menos que peça)
- Não invente estatísticas
- Não use linguagem genérica de assistente ("Em conclusão...", "É importante notar que...")

# Estrutura preferida
[Defina sua estrutura padrão — ex: PAS, AIDA, etc]`

const UNIVERSAL_TEMPLATE = `# Regras GERAIS de copywriting (todos os projetos)

## Tom universal
- Use português brasileiro coloquial
- Frases curtas
- Sem jargão de assistente ("Em conclusão", "É importante notar", "Como assistente...")
- Sem emojis (a menos que pedido)

## Princípios de resposta direta
- Sempre comece pelo benefício, depois o mecanismo
- Toda promessa precisa de prova (testemunho, número, story)
- CTA específico e único — não múltiplas opções
- Use verbos no imperativo ("descubra", "aprenda", "veja")

## O que NUNCA fazer
- Inventar estatísticas ou estudos
- Usar clichês ("Você sabia que...", "Imagine isso...")
- Hedge ("talvez", "pode ser que")
- Genérico ("muitas pessoas", "frequentemente")

## Formato de resposta
- Quando der opções (hooks, CTAs), numere e dê 5 variações
- Quando explicar uma análise, use bullet points
- Quando escrever copy, entregue como markdown limpo
`

const TYPE_META = {
  document:           { icon: FileType,   label: 'Documento',     color: '#3b82f6' },
  vsl_analysis:       { icon: FileVideo,  label: 'Análise VSL',   color: '#10b981' },
  ad_analysis:        { icon: Megaphone,  label: 'Análise Ad',    color: '#f59e0b' },
  transcript_vsl:     { icon: FileVideo,  label: 'Transcrição VSL', color: '#06b6d4' },
  transcript_ad:      { icon: Megaphone,  label: 'Transcrição Ad',  color: '#ec4899' },
  transcript_organic: { icon: FileText,   label: 'Vídeo Orgânico',  color: '#8b5cf6' },
  transcript_lesson:  { icon: FileText,   label: 'Aula / Podcast',  color: '#22c55e' },
  manual_note:        { icon: FileText,   label: 'Nota manual',     color: '#a855f7' },
  hook:               { icon: FileText,   label: 'Hook',            color: '#f97316' },
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CopyZonePage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const projectId = activeProject?.id

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [showImportHelp, setShowImportHelp] = useState(null)  // 'obsidian' | 'notion' | 'claude' | null
  const fileInputRef = useRef(null)
  const zipInputRef = useRef(null)
  const [zipSource, setZipSource] = useState('upload')

  // Custom Instructions (Universal + Projeto)
  const [instructionsTab, setInstructionsTab] = useState('project')  // 'universal' | 'project'

  const [instructions, setInstructions] = useState('')
  const [instructionsOriginal, setInstructionsOriginal] = useState('')
  const [instructionsLoading, setInstructionsLoading] = useState(false)
  const [savingInstructions, setSavingInstructions] = useState(false)
  const [instructionsExpanded, setInstructionsExpanded] = useState(true)

  const [universalInstructions, setUniversalInstructions] = useState('')
  const [universalOriginal, setUniversalOriginal] = useState('')
  const [universalLoading, setUniversalLoading] = useState(false)
  const [savingUniversal, setSavingUniversal] = useState(false)

  const loadItems = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await api.get(`/intelligence/${projectId}/documents`)
      setItems(res.data || [])
    } catch {
      toast.error('Erro ao carregar memória')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [projectId]) // eslint-disable-line

  // Carrega instructions ao trocar de projeto
  useEffect(() => {
    if (!projectId) { setInstructions(''); setInstructionsOriginal(''); return }
    setInstructionsLoading(true)
    api.get(`/copy-zone/${projectId}/instructions`)
      .then(res => {
        const txt = res.data?.instructions || ''
        setInstructions(txt)
        setInstructionsOriginal(txt)
      })
      .catch(() => {})
      .finally(() => setInstructionsLoading(false))
  }, [projectId])

  const handleSaveInstructions = async () => {
    if (!projectId) return
    setSavingInstructions(true)
    try {
      await api.put(`/copy-zone/${projectId}/instructions`, { instructions })
      setInstructionsOriginal(instructions)
      toast.success('Instruções salvas!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar instruções')
    } finally {
      setSavingInstructions(false)
    }
  }

  const handleLoadTemplate = async () => {
    if (instructionsTab === 'project') {
      if (instructions.trim() && !(await confirmAction({ title: 'Substituir as instruções deste projeto?', message: 'O conteúdo atual será trocado pelo template.', confirmLabel: 'Substituir' }))) return
      setInstructions(INSTRUCTIONS_TEMPLATE)
    } else {
      if (universalInstructions.trim() && !(await confirmAction({ title: 'Substituir as instruções universais?', message: 'O conteúdo atual será trocado pelo template.', confirmLabel: 'Substituir' }))) return
      setUniversalInstructions(UNIVERSAL_TEMPLATE)
    }
  }

  // Carrega instruções universais (uma vez, ao montar)
  useEffect(() => {
    setUniversalLoading(true)
    api.get('/auth/me/universal-instructions')
      .then(res => {
        const txt = res.data?.instructions || ''
        setUniversalInstructions(txt)
        setUniversalOriginal(txt)
      })
      .catch(() => {})
      .finally(() => setUniversalLoading(false))
  }, [])

  const handleSaveUniversal = async () => {
    setSavingUniversal(true)
    try {
      await api.put('/auth/me/universal-instructions', { instructions: universalInstructions })
      setUniversalOriginal(universalInstructions)
      toast.success('Instruções universais salvas!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSavingUniversal(false)
    }
  }

  const hasUnsavedInstructions = instructions !== instructionsOriginal
  const hasUnsavedUniversal = universalInstructions !== universalOriginal

  // Decide qual aba mostrar
  const activeText = instructionsTab === 'project' ? instructions : universalInstructions
  const activeSetText = instructionsTab === 'project' ? setInstructions : setUniversalInstructions
  const activeLoading = instructionsTab === 'project' ? instructionsLoading : universalLoading
  const activeSaving = instructionsTab === 'project' ? savingInstructions : savingUniversal
  const activeHasUnsaved = instructionsTab === 'project' ? hasUnsavedInstructions : hasUnsavedUniversal
  const activeSaveFn = instructionsTab === 'project' ? handleSaveInstructions : handleSaveUniversal

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !projectId) return
    setUploading(true)
    let ok = 0
    let totalImported = 0
    for (const file of files) {
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('source', zipSource)
        const res = await api.post(`/intelligence/${projectId}/documents`, form)
        ok++
        // Se foi ZIP, conta arquivos extraídos
        if (res.data?.imported) totalImported += res.data.imported
      } catch (err) {
        toast.error(`${file.name}: ${err.response?.data?.detail || err.message}`)
      }
    }
    if (totalImported > 0) {
      toast.success(`${totalImported} arquivo(s) importado(s) do ZIP`)
    } else if (ok) {
      toast.success(`${ok} documento(s) carregado(s)`)
    }
    setUploading(false)
    setZipSource('upload')
    e.target.value = ''
    loadItems()
  }

  const openImport = (source) => {
    setZipSource(source)
    setShowImportHelp(source)
  }

  const triggerZipInput = () => {
    zipInputRef.current?.click()
  }

  const handleDelete = async (id) => {
    if (!(await confirmAction({ title: 'Remover essa entrada da memória?', confirmLabel: 'Remover' }))) return
    try {
      await api.delete(`/intelligence/${projectId}/documents/${id}`)
      toast.success('Removido')
      loadItems()
    } catch {
      toast.error('Erro ao remover')
    }
  }

  const handleToggle = async (id, currentActive) => {
    try {
      await api.patch(`/intelligence/${projectId}/documents/${id}/toggle`, { active: !currentActive })
      loadItems()
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  const handleExportObsidian = async () => {
    if (!projectId) return
    try {
      const res = await api.get(`/intelligence/${projectId}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }))
      const a = document.createElement('a')
      const cd = res.headers['content-disposition'] || ''
      const match = cd.match(/filename="([^"]+)"/)
      a.href = url
      a.download = match ? match[1] : `copyx-${activeProject.name || 'projeto'}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('ZIP gerado! Extraia no seu vault do Obsidian.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao exportar')
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--accent)' }}>Inteligência</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {activeProject
            ? `Repositório de conhecimento do projeto "${activeProject.name}" — documentos, análises e notas que alimentam o assistente na hora de criar copy.`
            : 'Selecione um projeto no topbar para gerenciar a memória.'}
        </p>
      </div>

      {/* Instruções (sempre visível — Universal funciona sem projeto) */}
      <>
          {/* Instruções customizadas — Universal + Projeto */}
          <div style={{
            border: `1px solid ${activeHasUnsaved ? '#f59e0b' : 'var(--border-default)'}`,
            borderLeft: '3px solid #8b5cf6',
            borderRadius: '10px', marginBottom: '20px',
            background: 'var(--bg-surface)', overflow: 'hidden',
          }}>
            <div
              onClick={() => setInstructionsExpanded((v) => !v)}
              style={{
                padding: '14px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={15} style={{ color: '#8b5cf6' }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Instruções do assistente
                    {(hasUnsavedInstructions || hasUnsavedUniversal) && (
                      <span style={{ marginLeft: '8px', fontSize: '10px', color: '#f59e0b', fontWeight: 500 }}>
                        ● não salvo
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    Como o assistente deve escrever — universais (todo projeto) + específicas (deste projeto)
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                U: {universalInstructions.length.toLocaleString()} · P: {instructions.length.toLocaleString()}
              </div>
            </div>

            {instructionsExpanded && (
              <div style={{ borderTop: '1px solid var(--border-default)' }}>
                {/* Tabs Universal | Projeto */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <button
                    onClick={() => setInstructionsTab('universal')}
                    style={{
                      flex: 1, padding: '10px 14px', fontSize: '12px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font)', fontWeight: instructionsTab === 'universal' ? 600 : 400,
                      color: instructionsTab === 'universal' ? 'var(--text-primary)' : 'var(--text-muted)',
                      borderBottom: instructionsTab === 'universal' ? '2px solid #8b5cf6' : '2px solid transparent',
                      marginBottom: '-1px',
                    }}
                  >
                    🌐 Universais
                    {hasUnsavedUniversal && instructionsTab !== 'universal' && (
                      <span style={{ marginLeft: '4px', color: '#f59e0b' }}>●</span>
                    )}
                  </button>
                  <button
                    onClick={() => setInstructionsTab('project')}
                    disabled={!projectId}
                    style={{
                      flex: 1, padding: '10px 14px', fontSize: '12px',
                      background: 'transparent', border: 'none', cursor: projectId ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font)', fontWeight: instructionsTab === 'project' ? 600 : 400,
                      color: instructionsTab === 'project' ? 'var(--text-primary)' : 'var(--text-muted)',
                      borderBottom: instructionsTab === 'project' ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: '-1px',
                      opacity: projectId ? 1 : 0.4,
                    }}
                  >
                    📌 Deste projeto {activeProject?.name && `(${activeProject.name})`}
                    {hasUnsavedInstructions && instructionsTab !== 'project' && (
                      <span style={{ marginLeft: '4px', color: '#f59e0b' }}>●</span>
                    )}
                  </button>
                </div>

                {/* Conteúdo da aba ativa */}
                <div style={{ padding: '14px 16px' }}>
                  {/* Descrição contextual */}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
                    {instructionsTab === 'universal' ? (
                      <>🌐 <strong>Universais</strong> — valem pra <strong>todos</strong> os projetos. Coloque aqui regras gerais (tom, formato de resposta, o que nunca fazer).</>
                    ) : (
                      <>📌 <strong>Deste projeto</strong> — específicas para <strong>{activeProject?.name || '...'}</strong>. Têm prioridade sobre as universais em caso de conflito.</>
                    )}
                  </div>

                  {activeLoading ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                      Carregando...
                    </div>
                  ) : (
                    <>
                      <textarea
                        className="tc-input"
                        placeholder={instructionsTab === 'universal'
                          ? 'Ex: Use sempre português coloquial. Frases curtas. Sem emojis...'
                          : 'Ex: Você é copywriter especialista em emagrecimento. Avatar: mulher 35-55, casada...'}
                        value={activeText}
                        onChange={(e) => activeSetText(e.target.value)}
                        rows={activeText ? Math.min(Math.max(8, activeText.split('\n').length), 30) : 6}
                        style={{ width: '100%', resize: 'vertical', fontSize: '12px', lineHeight: 1.55, fontFamily: 'monospace' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={handleLoadTemplate}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '6px 11px', borderRadius: '6px', fontSize: '12px',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
                          }}
                        >
                          <BookOpen size={11} /> Carregar template
                        </button>
                        <button
                          onClick={activeSaveFn}
                          disabled={activeSaving || !activeHasUnsaved}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '7px 14px', borderRadius: '6px', fontSize: '12px',
                            background: activeHasUnsaved ? '#8b5cf6' : 'var(--bg-elevated)',
                            border: `1px solid ${activeHasUnsaved ? '#8b5cf6' : 'var(--border-default)'}`,
                            color: activeHasUnsaved ? '#fff' : 'var(--text-muted)',
                            cursor: activeHasUnsaved ? 'pointer' : 'default',
                            fontFamily: 'var(--font)', fontWeight: 500,
                            opacity: activeSaving ? 0.6 : 1,
                          }}
                        >
                          <Save size={11} /> {activeSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

      </>

      {/* O resto (upload + memória) só com projeto */}
      {!projectId ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Selecione um projeto pra ver/gerenciar a memória e fazer uploads.
        </div>
      ) : (
        <>
          {/* Upload de arquivos avulsos */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-default)',
              borderRadius: '12px',
              padding: '24px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--bg-elevated)',
              marginBottom: '12px',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
          >
            <Upload size={22} style={{ color: 'var(--text-muted)', marginBottom: '6px' }} />
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {uploading ? 'Enviando...' : 'Arquivos avulsos'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              PDF, DOCX, TXT, MD — múltiplos arquivos
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              multiple
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* Importar de fontes externas */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
              Importar de fontes externas (ZIP)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { id: 'obsidian', label: 'Obsidian',         color: '#7c3aed', emoji: '🪨' },
                { id: 'notion',   label: 'Notion',           color: '#000000', emoji: '📝' },
                { id: 'claude',   label: 'ZIP genérico',     color: '#d97706', emoji: '📦' },
              ].map((src) => (
                <button
                  key={src.id}
                  onClick={() => openImport(src.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '11px 10px', borderRadius: '8px', fontSize: '13px',
                    background: 'var(--bg-elevated)',
                    border: `1px solid var(--border-default)`,
                    color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font)',
                    transition: 'all 0.15s', fontWeight: 500,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = src.color; e.currentTarget.style.background = 'var(--bg-surface)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
                >
                  <span>{src.emoji}</span>
                  <span>{src.label}</span>
                </button>
              ))}
            </div>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* Modal de instruções */}
          {showImportHelp && (
            <div
              onClick={() => setShowImportHelp(null)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, padding: '20px',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                  borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '100%',
                  maxHeight: '85vh', overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <FolderArchive size={18} style={{ color: '#8b5cf6' }} />
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Importar do {showImportHelp === 'obsidian' ? 'Obsidian' : showImportHelp === 'notion' ? 'Notion' : 'ZIP genérico'}
                  </div>
                </div>

                {showImportHelp === 'obsidian' && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <p style={{ marginBottom: '12px' }}><strong>Como exportar do Obsidian:</strong></p>
                    <ol style={{ paddingLeft: '20px', margin: '0 0 16px' }}>
                      <li>Abra a pasta do seu vault no explorador de arquivos</li>
                      <li>Selecione a pasta ou notas que quer importar</li>
                      <li>Clique direito → <strong>Comprimir</strong> → ZIP</li>
                      <li>Clique no botão abaixo e envie o ZIP</li>
                    </ol>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Cada arquivo <code>.md</code> dentro do ZIP vira uma entrada de memória separada.
                      Arquivos da pasta <code>.obsidian/</code> são ignorados automaticamente.
                    </p>
                  </div>
                )}

                {showImportHelp === 'notion' && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <p style={{ marginBottom: '12px' }}><strong>Como exportar do Notion:</strong></p>
                    <ol style={{ paddingLeft: '20px', margin: '0 0 16px' }}>
                      <li>Abra a página ou workspace que quer exportar</li>
                      <li>Clique nos <strong>três pontos (⋯)</strong> no canto superior direito</li>
                      <li>Selecione <strong>Exportar</strong></li>
                      <li>Formato: <strong>Markdown & CSV</strong></li>
                      <li>Inclua subpáginas se quiser</li>
                      <li>Clique <strong>Exportar</strong> — Notion gera um ZIP</li>
                      <li>Envie o ZIP no botão abaixo</li>
                    </ol>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Os hashes do Notion no fim do nome de cada arquivo são removidos automaticamente.
                    </p>
                  </div>
                )}

                {showImportHelp === 'claude' && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <p style={{ marginBottom: '12px' }}><strong>Envie um ZIP com seus arquivos:</strong></p>
                    <ol style={{ paddingLeft: '20px', margin: '0 0 16px' }}>
                      <li>Junte os documentos que quer adicionar à memória numa pasta</li>
                      <li>Compacte a pasta em ZIP (clique direito → Comprimir)</li>
                      <li>Envie o ZIP no botão abaixo</li>
                    </ol>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Aceita: <code>.md</code>, <code>.txt</code>, <code>.pdf</code>, <code>.docx</code> dentro do ZIP.
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <button
                    onClick={() => setShowImportHelp(null)}
                    style={{ padding: '8px 14px', borderRadius: '7px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { setShowImportHelp(null); triggerZipInput() }}
                    className="tc-btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FolderArchive size={13} /> Selecionar ZIP
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header com export */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
              Memória do projeto · {items.length} entrada{items.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={handleExportObsidian}
              title="Baixa um ZIP com tudo do projeto em Markdown — pronto pra extrair no Obsidian"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', background: '#7c3aed', border: '1px solid #7c3aed', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              <Download size={12} /> Exportar para Obsidian
            </button>
          </div>

          {loading && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando...</div>}

          {!loading && items.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
              Nenhuma memória ainda. Envie documentos acima ou salve análises de VSL/Ads.
            </div>
          )}

          {items.map((item) => {
            const meta = TYPE_META[item.type] || TYPE_META.manual_note
            const Icon = meta.icon
            const title = item.metadata?.title || 'Sem título'
            const preview = (item.content || '').slice(0, 200)
            const isOpen = expandedId === item.id
            return (
              <div key={item.id} style={{
                border: '1px solid var(--border-default)',
                borderLeft: `3px solid ${meta.color}`,
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '8px',
                background: 'var(--bg-surface)',
                opacity: item.active ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={14} style={{ color: meta.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {title}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                      <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                      <span>·</span>
                      <span>{(item.content?.length || 0).toLocaleString()} caracteres</span>
                      {item.metadata?.filename && (<><span>·</span><span>{item.metadata.filename}</span></>)}
                    </div>
                  </div>
                  <button onClick={() => setExpandedId(isOpen ? null : item.id)} title={isOpen ? 'Recolher' : 'Ver conteúdo'} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <Eye size={13} />
                  </button>
                  <button onClick={() => handleToggle(item.id, item.active)} title={item.active ? 'Desativar (não usar no contexto)' : 'Ativar'} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: item.active ? '#22c55e' : 'var(--text-muted)' }}>
                    {item.active ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button onClick={() => handleDelete(item.id)} title="Remover" style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {isOpen && (
                  <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto', lineHeight: 1.6 }}>
                    {item.content}
                  </div>
                )}
                {!isOpen && preview && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {preview}{(item.content || '').length > 200 ? '...' : ''}
                  </div>
                )}
              </div>
            )
          })}

          {/* Dica */}
          <div style={{ marginTop: '24px', padding: '12px 14px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Brain size={14} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: '1px' }} />
            <div>
              Esta memória é usada como contexto pelo assistente na página <strong>Escrever</strong>.
              Quanto mais conhecimento do nicho você adicionar aqui, melhores serão as sugestões na hora de escrever.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
