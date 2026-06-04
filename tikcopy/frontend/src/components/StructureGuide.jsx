import { useState } from 'react'
import { Eye, EyeOff, Pencil, Check, Plus, Trash2, ListTree } from 'lucide-react'

/**
 * Guia da ESTRUTURA INVISÍVEL extraída da Comunicação (modo Manual).
 * Mostra o esqueleto psicológico do orgânico como referência editável.
 *
 * Props:
 *  - part: 'hook' | 'body'
 *  - hookText: string                (part === 'hook')
 *  - steps: [{label, purpose}]        (part === 'body')
 *  - visible: bool                    toggle global 
 *  - onToggleVisible: () => void
 *  - onChangeHook: (str) => void
 *  - onChangeSteps: (arr) => void
 */
export default function StructureGuide({
  part, hookText = '', steps = [], visible, onToggleVisible, onChangeHook, onChangeSteps,
}) {
  const [editing, setEditing] = useState(false)

  const accent = 'var(--accent)'
  const wrap = {
    background: 'rgba(255,62,94,0.06)', border: '1px dashed rgba(255,62,94,0.45)',
    borderRadius: '10px', marginBottom: '12px', overflow: 'hidden',
  }
  const headerRow = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 12px', gap: '8px',
  }
  const iconBtn = {
    background: 'transparent', border: 'none', cursor: 'pointer', color: accent,
    display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'var(--font)',
  }

  return (
    <div style={wrap}>
      <div style={headerRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: accent, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <ListTree size={13} />
          Estrutura invisível {part === 'hook' ? 'do gancho' : 'do body'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {visible && (
            <button style={iconBtn} onClick={() => setEditing(e => !e)} title={editing ? 'Concluir edição' : 'Editar estrutura'}>
              {editing ? <><Check size={12} /> Pronto</> : <><Pencil size={12} /> Editar</>}
            </button>
          )}
          <button style={iconBtn} onClick={onToggleVisible} title={visible ? 'Ocultar guia' : 'Mostrar guia'}>
            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      {visible && (
        <div style={{ padding: '0 12px 12px' }}>
          {part === 'hook' ? (
            editing ? (
              <textarea
                className="tc-input"
                value={hookText}
                onChange={(e) => onChangeHook(e.target.value)}
                rows={2}
                style={{ width: '100%', fontSize: '12px', lineHeight: 1.5, resize: 'vertical' }}
                placeholder="Estrutura invisível do gancho…"
              />
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                {hookText || '—'}
              </div>
            )
          ) : (
            <StepsEditor steps={steps} editing={editing} onChange={onChangeSteps} accent={accent} />
          )}
        </div>
      )}
    </div>
  )
}

function StepsEditor({ steps, editing, onChange, accent }) {
  const update = (i, key, val) => {
    const next = steps.map((s, idx) => idx === i ? { ...s, [key]: val } : s)
    onChange(next)
  }
  const remove = (i) => onChange(steps.filter((_, idx) => idx !== i))
  const add = () => onChange([...steps, { label: '', purpose: '' }])

  if (!steps.length) {
    return <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{
            flexShrink: 0, width: '20px', height: '20px', borderRadius: '5px', marginTop: '1px',
            background: 'rgba(255,62,94,0.15)', color: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: 700,
          }}>{i + 1}</div>
          {editing ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <input
                className="tc-input"
                value={s.label}
                onChange={(e) => update(i, 'label', e.target.value)}
                placeholder="Nome do bloco (ex: Identificação da dor)"
                style={{ fontSize: '11px', fontWeight: 600 }}
              />
              <input
                className="tc-input"
                value={s.purpose}
                onChange={(e) => update(i, 'purpose', e.target.value)}
                placeholder="O que faz na cabeça do lead"
                style={{ fontSize: '11px' }}
              />
            </div>
          ) : (
            <div style={{ flex: 1, fontSize: '12px', lineHeight: 1.45 }}>
              {s.label && <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}: </span>}
              <span style={{ color: 'var(--text-secondary)' }}>{s.purpose}</span>
            </div>
          )}
          {editing && (
            <button onClick={() => remove(i)} title="Remover passo" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginTop: '2px' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {editing && (
        <button onClick={add} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '5px', background: 'transparent', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Plus size={11} /> Adicionar passo
        </button>
      )}
    </div>
  )
}
