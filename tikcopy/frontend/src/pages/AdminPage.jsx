import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Loader2, RefreshCw } from 'lucide-react'
import api from '../services/api'

export default function AdminPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/usage')
      .then((r) => setData(r.data))
      .catch((e) => { if (e.response?.status === 403) setDenied(true) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  if (denied) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Acesso restrito</div>
        <div style={{ fontSize: '13px' }}>Esse painel é só pra administradores.</div>
        <button onClick={() => navigate('/')} style={{ marginTop: '14px', padding: '8px 16px', borderRadius: '7px', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>Voltar</button>
      </div>
    )
  }

  const brl = (v) => `R$ ${Number(v || 0).toFixed(2)}`

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={20} style={{ color: 'var(--accent)' }} /> Painel de <span style={{ color: 'var(--accent)' }}>Custo & Uso</span>
        </h1>
        <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '7px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '12px' }}>
          {loading ? <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> : <RefreshCw size={13} />} Atualizar
        </button>
      </div>

      {loading && !data ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando…</div>
      ) : data ? (
        <>
          {/* Totais */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <Card label="Custo total" value={brl(data.total_cost_brl)} sub={`US$ ${data.total_cost_usd}`} accent />
            <Card label="Operações de IA" value={data.total_events.toLocaleString('pt-BR')} />
            <Card label="Usuários ativos" value={data.users.length} />
            <Card label="Câmbio usado" value={`R$ ${data.usd_to_brl}/US$`} />
          </div>

          {/* Por usuário */}
          <Section title="Custo por usuário">
            <Table head={['Usuário', 'Operações', 'Custo (R$)', 'Custo (US$)']}>
              {data.users.map((u) => (
                <tr key={u.user_id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <Td><strong>{u.email}</strong></Td>
                  <Td>{u.events}</Td>
                  <Td>{brl(u.cost_brl)}</Td>
                  <Td muted>${u.cost_usd}</Td>
                </tr>
              ))}
              {data.users.length === 0 && <tr><Td colSpan={4} muted>Nenhum uso registrado ainda.</Td></tr>}
            </Table>
          </Section>

          {/* Por operação */}
          <Section title="Custo por tipo de operação">
            <Table head={['Operação', 'Qtd', 'Custo (R$)', 'Média/uso (R$)']}>
              {data.operations.map((o) => (
                <tr key={o.operation} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <Td><code style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{o.operation}</code></Td>
                  <Td>{o.events}</Td>
                  <Td>{brl(o.cost_brl)}</Td>
                  <Td muted>{brl(o.events ? o.cost_brl / o.events : 0)}</Td>
                </tr>
              ))}
              {data.operations.length === 0 && <tr><Td colSpan={4} muted>—</Td></tr>}
            </Table>
          </Section>
        </>
      ) : null}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Card({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: '1 1 180px', padding: '16px 18px', borderRadius: '10px',
      background: accent ? 'rgba(255,62,94,0.06)' : 'var(--bg-elevated)',
      border: `1px solid ${accent ? 'rgba(255,62,94,0.2)' : 'var(--border-default)'}`,
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-primary)', letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>{title}</div>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '10px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Table({ head, children }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr>{head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function Td({ children, muted, colSpan }) {
  return <td colSpan={colSpan} style={{ padding: '10px 14px', color: muted ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{children}</td>
}
