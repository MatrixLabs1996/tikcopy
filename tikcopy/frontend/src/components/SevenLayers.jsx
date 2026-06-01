import { Layers3 } from 'lucide-react'

// Ordem e rótulos das 7 camadas macro (framework @wanderps_)
const LAYERS = [
  ['estrutura_invisivel', '1. Estrutura Invisível'],
  ['formato', '2. Formato'],
  ['angulo', '3. Ângulo'],
  ['fatia_publico', '4. Fatia de Público'],
  ['avatar', '5. Avatar'],
  ['tema', '6. Tema'],
  ['nivel_consciencia', '7. Nível de Consciência'],
]

// `data` = { estrutura_invisivel: {valor, justificativa}, ..., coerencia: "..." }
export default function SevenLayers({ data }) {
  if (!data) return null

  return (
    <div style={{ border: '1px solid var(--border-default)', borderLeft: '3px solid #f43f5e', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(244,63,94,0.06)', borderBottom: '1px solid var(--border-default)' }}>
        <Layers3 size={13} style={{ color: '#f43f5e' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#f43f5e' }}>
          7 Camadas Macro
        </span>
      </div>
      <div style={{ padding: '14px 16px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {LAYERS.map(([key, label]) => {
          const layer = data[key]
          if (!layer) return null
          const valor = typeof layer === 'string' ? layer : layer.valor
          const justificativa = typeof layer === 'object' ? layer.justificativa : ''
          if (!valor) return null
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>
                {label}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{valor}</div>
              {justificativa && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{justificativa}</div>
              )}
            </div>
          )
        })}
        {data.coerencia && (
          <div style={{ marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '3px' }}>
              Coerência & Variação
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{data.coerencia}</div>
          </div>
        )}
      </div>
    </div>
  )
}
