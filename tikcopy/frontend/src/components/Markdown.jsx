import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renderiza markdown com estilo consistente da app.
 * Aceita negrito (**texto**), itálico, listas, headers, etc.
 */
export default function Markdown({ children }) {
  if (!children) return null
  return (
    <div style={{ fontSize: '13px', lineHeight: 1.75, color: 'var(--text-primary)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headers
          h1: ({ children }) => <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '18px 0 10px', letterSpacing: '-0.3px' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 8px', letterSpacing: '-0.2px' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</h3>,

          // Parágrafos
          p: ({ children }) => <p style={{ margin: '0 0 10px', color: 'var(--text-primary)' }}>{children}</p>,

          // Negrito e itálico
          strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{children}</em>,

          // Listas
          ul: ({ children }) => <ul style={{ margin: '4px 0 12px', paddingLeft: '20px' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0 12px', paddingLeft: '22px' }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '3px 0', color: 'var(--text-secondary)' }}>{children}</li>,

          // Citações
          blockquote: ({ children }) => (
            <blockquote style={{
              margin: '8px 0', padding: '8px 14px',
              borderLeft: '3px solid var(--accent)',
              background: 'rgba(255,62,94,0.04)',
              borderRadius: '0 6px 6px 0',
              fontStyle: 'italic', color: 'var(--text-secondary)',
            }}>{children}</blockquote>
          ),

          // Código inline e bloco
          code: ({ inline, children }) => inline ? (
            <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent)' }}>{children}</code>
          ) : (
            <pre style={{ background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', overflowX: 'auto', margin: '8px 0' }}><code>{children}</code></pre>
          ),

          // Linha horizontal
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '14px 0' }} />,

          // Tabelas (GFM)
          table: ({ children }) => <table style={{ borderCollapse: 'collapse', margin: '10px 0', width: '100%', fontSize: '12px' }}>{children}</table>,
          th: ({ children }) => <th style={{ border: '1px solid var(--border-default)', padding: '6px 10px', background: 'var(--bg-elevated)', textAlign: 'left', fontWeight: 600 }}>{children}</th>,
          td: ({ children }) => <td style={{ border: '1px solid var(--border-subtle)', padding: '6px 10px', color: 'var(--text-secondary)' }}>{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
