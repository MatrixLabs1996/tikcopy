import { Brain } from 'lucide-react'

export default function MemoryToggle({ checked, onChange, projectName, disabled }) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '9px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      userSelect: 'none',
      padding: '8px 12px',
      borderRadius: '7px',
      border: `1px solid ${checked ? 'rgba(255,62,94,0.3)' : 'var(--border-default)'}`,
      background: checked ? 'rgba(255,62,94,0.06)' : 'var(--bg-elevated)',
      transition: 'all 0.15s',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      {/* toggle visual */}
      <div style={{
        width: '28px', height: '16px',
        borderRadius: '999px',
        background: checked ? 'var(--accent)' : 'var(--border-strong)',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}>
        <div style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '14px' : '2px',
          width: '12px', height: '12px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      <Brain size={13} color={checked ? 'var(--accent)' : 'var(--text-muted)'} />
      <span style={{ fontSize: '12px', color: checked ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: checked ? 500 : 400 }}>
        {disabled
          ? 'Salvar na memória (selecione um projeto)'
          : checked
            ? `Salvar na memória de "${projectName}"`
            : 'Salvar apenas no histórico'}
      </span>
    </label>
  )
}
