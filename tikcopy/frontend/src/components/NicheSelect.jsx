import { useState } from 'react'
import { X } from 'lucide-react'
import useTaxonomyStore, { useAllNiches } from '../stores/useTaxonomyStore'

/**
 * Select com opção "+ Criar novo…" — usado pra escolher nicho em qualquer página.
 * Mesma lista NICHOS_PRESET do Swipe File, garantindo consistência das tags.
 *
 * Props:
 *  - value: string atual
 *  - onChange: (string) => void
 *  - placeholder?: string
 *  - allowCreate?: bool (default true)
 *  - style?: object — aplicado no select/input
 */
export default function NicheSelect({ value, onChange, placeholder = 'Selecione o nicho…', allowCreate = true, style }) {
  const [creating, setCreating] = useState(false)
  const [custom, setCustom] = useState('')
  const niches = useAllNiches()
  const addNiche = useTaxonomyStore((s) => s.addNiche)
  const isCustomValue = value && !niches.includes(value)

  // Registra o nicho custom no store global → aparece nos outros dropdowns
  const commit = (v) => {
    const val = (v || '').trim()
    if (!val) return
    addNiche(val)
    onChange(val)
    setCreating(false)
  }

  if (creating) {
    return (
      <div style={{ display: 'flex', gap: '6px', ...style }}>
        <input
          autoFocus
          className="tc-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Digite o novo nicho…"
          style={{ flex: 1, fontSize: '13px' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (custom.trim()) commit(custom.trim())
            }
            if (e.key === 'Escape') { setCreating(false); setCustom('') }
          }}
        />
        <button
          type="button"
          onClick={() => { if (custom.trim()) commit(custom.trim()) }}
          style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px' }}
        >OK</button>
        <button
          type="button"
          onClick={() => { setCreating(false); setCustom('') }}
          style={{ padding: '6px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        ><X size={12} /></button>
      </div>
    )
  }

  return (
    <select
      className="tc-input"
      value={isCustomValue ? '__custom__' : (value || '')}
      onChange={(e) => {
        if (e.target.value === '__new__') { setCreating(true); return }
        onChange(e.target.value || '')
      }}
      style={{ width: '100%', fontSize: '13px', ...style }}
    >
      <option value="">{placeholder}</option>
      {niches.map(n => <option key={n} value={n}>{n}</option>)}
      {isCustomValue && <option value="__custom__">★ {value} (custom)</option>}
      {allowCreate && <option value="__new__">+ Criar novo nicho…</option>}
    </select>
  )
}
