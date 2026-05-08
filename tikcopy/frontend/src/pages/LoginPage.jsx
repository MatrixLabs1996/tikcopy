import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../services/supabase'
import useAppStore from '../stores/useAppStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser, setSession } = useAppStore()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setUser(data.user)
      setSession(data.session)
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Falha ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '44px', height: '44px', background: '#fff',
            borderRadius: '12px', fontSize: '18px', fontWeight: 800,
            color: 'var(--accent)', letterSpacing: '-1px', marginBottom: '14px',
          }}>TC</div>
          <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
            Tik<span style={{ color: 'var(--accent)' }}>Copy</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Entrar na sua conta
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="tc-label">E-mail</label>
            <input
              type="email"
              className="tc-input"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="tc-label">Senha</label>
            <input
              type="password"
              className="tc-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="tc-btn-primary"
            style={{ width: '100%', marginTop: '4px', padding: '11px' }}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Não tem conta?{' '}
          <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            Criar conta
          </Link>
        </div>

        {/* Dev: modo demo sem Supabase */}
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Sem Supabase configurado?
          </div>
          <button
            onClick={() => {
              setUser({ id: 'demo', email: 'demo@tikcopy.com', user_metadata: { name: 'Demo User' } })
              navigate('/')
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              borderRadius: '7px',
              padding: '8px 20px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              width: '100%',
            }}
          >
            Entrar em modo demo
          </button>
        </div>
      </div>
    </div>
  )
}
