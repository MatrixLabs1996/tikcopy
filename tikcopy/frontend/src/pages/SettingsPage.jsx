import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAppStore from '../stores/useAppStore'

export default function SettingsPage() {
  const { user, setUser } = useAppStore()
  const [name, setName] = useState(user?.user_metadata?.name || '')
  const [profile, setProfile] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/auth/me').then((r) => setProfile(r.data)).catch(() => {})
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch('/auth/me', { name })
      toast.success('Perfil atualizado!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const PLAN_LABEL = { free: 'Gratuito', pro: 'Pro', agency: 'Agência' }

  return (
    <div style={{ maxWidth: '480px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>
          Configurações
        </h1>
      </div>

      {profile && (
        <div className="tc-card" style={{ marginBottom: '16px' }}>
          <div className="tc-section-title" style={{ marginBottom: '10px' }}>Plano atual</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {PLAN_LABEL[profile.plan] || profile.plan}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {profile.minutes_used} / {profile.minutes_limit} minutos utilizados
          </div>
        </div>
      )}

      <div className="tc-card">
        <div className="tc-section-title" style={{ marginBottom: '14px' }}>Perfil</div>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="tc-label">Nome</label>
            <input className="tc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div>
            <label className="tc-label">E-mail</label>
            <input className="tc-input" value={user?.email || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
          <button className="tc-btn-primary" type="submit" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>
    </div>
  )
}
