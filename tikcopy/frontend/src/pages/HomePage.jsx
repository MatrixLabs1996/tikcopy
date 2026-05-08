import { useNavigate } from 'react-router-dom'
import { Video, GraduationCap, Megaphone, MessageSquare, LayoutTemplate, Search } from 'lucide-react'
import useAppStore from '../stores/useAppStore'

const cards = [
  { icon: Video, title: 'Vídeos Orgânicos', desc: 'Transcreva e formate TikToks, Reels e Shorts em hook + corpo.', to: '/organic' },
  { icon: GraduationCap, title: 'Aulas & Longos', desc: 'Transcrição completa de aulas, podcasts e vídeos longos.', to: '/lessons' },
  { icon: Megaphone, title: 'Anúncios', desc: 'Análise de ads: avatar, hook visual, hook escrito e corpo.', to: '/ads' },
  { icon: MessageSquare, title: 'Zona de Copy', desc: 'Chat com IA usando a memória do seu projeto.', to: '/copy-zone' },
  { icon: LayoutTemplate, title: 'Templates & Rascunhos', desc: 'Crie templates de copy e escreva com sugestão de IA.', to: '/templates' },
  { icon: Search, title: 'Briefings & Pesquisas', desc: 'Organize seu processo de pesquisa de oferta e briefing.', to: '/briefings' },
]

export default function HomePage() {
  const user = useAppStore((s) => s.user)
  const navigate = useNavigate()
  const name = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Copywriter'

  return (
    <div>
      {/* Hero */}
      <div style={{ paddingBottom: '32px' }}>
        <div className="tc-badge" style={{ marginBottom: '16px' }}>
          <div className="tc-badge-dot" />
          TikCopy v2.0
        </div>
        <h1 style={{
          fontSize: '32px', fontWeight: 700, letterSpacing: '-0.8px',
          color: 'var(--text-primary)', lineHeight: 1.15, marginBottom: '10px',
        }}>
          Olá, {name} 👋
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '480px' }}>
          O que você quer fazer hoje? Cole um link, suba um vídeo ou continue de onde parou.
        </p>
      </div>

      {/* Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '12px',
      }}>
        {cards.map(({ icon: Icon, title, desc, to }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              padding: '18px',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)'
              e.currentTarget.style.background = 'var(--bg-elevated)'
            }}
          >
            <Icon size={20} color="var(--accent)" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '5px' }}>
              {title}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
