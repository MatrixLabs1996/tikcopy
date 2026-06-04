import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Loader2, Pencil, Save, Target, Search, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'
import Markdown from '../components/Markdown'
import { confirmAction } from '../stores/useConfirmStore'
import { productTypeLabel, funnelTypeLabel } from '../constants/offer'

function MetaPill({ label }) {
  if (!label) return null
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '999px',
      background: 'var(--bg-active)', border: '1px solid var(--border-default)',
      fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500,
    }}>{label}</span>
  )
}

// ─── Página da Oferta ───────────────────────────────────────────────────────

export default function BriefingsPage() {
  const activeProject = useAppStore((s) => s.activeProject)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [offer, setOffer] = useState(null)        // { exists, dossier, meta, ... }
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [undoing, setUndoing] = useState(false)

  const projectId = activeProject?.id

  const load = () => {
    if (!projectId) { setLoading(false); return }
    setLoading(true)
    api.get(`/offers/${projectId}`)
      .then((r) => setOffer(r.data))
      .catch((err) => {
        // 404 = projeto ainda sem dossiê → estado vazio, não é erro.
        if (err.response?.status === 404) { setOffer(null); return }
        toast.error('Erro ao carregar o projeto')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [projectId])

  const startEdit = () => { setDraft(offer?.dossier || ''); setEditing(true) }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await api.patch(`/offers/${projectId}`, { dossier: draft })
      setOffer((prev) => ({ ...prev, dossier: draft }))
      setEditing(false)
      toast.success('Dossiê salvo!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const undoLast = async () => {
    const ok = await confirmAction({
      title: 'Desfazer última atualização?',
      message: 'O dossiê volta pra versão anterior à última pesquisa vinculada. Não dá pra refazer depois.',
      confirmLabel: 'Desfazer',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    setUndoing(true)
    try {
      const r = await api.post(`/offers/${projectId}/undo`)
      setOffer((prev) => ({ ...prev, dossier: r.data.dossier, can_undo: false }))
      toast.success('Última atualização desfeita.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao desfazer')
    } finally { setUndoing(false) }
  }

  const meta = offer?.meta || {}
  const offerName = meta.offer_name || activeProject?.name || 'Projeto'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={18} color="var(--accent)" /> Projeto
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            O dossiê que a IA usa pra escrever toda a copy deste projeto.
            {activeProject?.name && <> Projeto: <strong>{activeProject.name}</strong></>}
          </p>
        </div>
        {offer?.exists && !editing && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={startEdit} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 16px', borderRadius: '7px', fontSize: '13px',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              <Pencil size={13} /> Editar
            </button>
            {offer?.can_undo && (
              <button onClick={undoLast} disabled={undoing} title="Desfazer a última pesquisa vinculada" style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '9px 16px', borderRadius: '7px', fontSize: '13px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: undoing ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font)', opacity: undoing ? 0.6 : 1,
              }}>
                {undoing
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Desfazendo…</>
                  : <><RotateCcw size={13} /> Desfazer última</>}
              </button>
            )}
            <button onClick={() => navigate('/researches')} className="tc-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px' }}>
              <Search size={13} /> Adicionar pesquisa
            </button>
          </div>
        )}
      </div>

      {!projectId ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', border: '1px dashed var(--border-default)', borderRadius: '10px' }}>
          <Target size={28} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>Nenhum projeto ativo</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Selecione ou crie um projeto em Meus Projetos.</div>
        </div>
      ) : loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando...</div>
      ) : !offer?.exists ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', border: '1px dashed var(--border-default)', borderRadius: '10px' }}>
          <FileText size={28} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Esse projeto ainda não tem dossiê
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Adicione pesquisas na aba Pesquisas e clique em "Vincular ao dossiê" pra a IA montar o dossiê.
          </div>
          <button onClick={() => navigate('/researches')} className="tc-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Search size={14} /> Ir para Pesquisas
          </button>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '12px', padding: '22px',
        }}>
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
              {offerName}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <MetaPill label={meta.niche} />
              <MetaPill label={productTypeLabel(meta.product_type)} />
              <MetaPill label={funnelTypeLabel(meta.funnel_type)} />
            </div>
          </div>

          {editing ? (
            <>
              <textarea
                className="tc-input tc-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={24}
                style={{ resize: 'vertical', fontSize: '13px', width: '100%', boxSizing: 'border-box', lineHeight: 1.6, fontFamily: 'monospace' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button onClick={() => setEditing(false)} disabled={saving} style={{
                  padding: '8px 14px', borderRadius: '7px', fontSize: '13px',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)',
                }}>Cancelar</button>
                <button onClick={saveEdit} disabled={saving} className="tc-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {saving
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</>
                    : <><Save size={13} /> Salvar</>}
                </button>
              </div>
            </>
          ) : (
            <Markdown>{offer.dossier}</Markdown>
          )}
        </div>
      )}
    </div>
  )
}
