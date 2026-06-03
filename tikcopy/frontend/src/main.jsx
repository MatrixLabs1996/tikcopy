import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles/tokens.css'

// Cache global de dados — stale-while-revalidate.
// staleTime: 30s = não refetcha em remount dentro desse tempo (volta instantâneo)
// refetchOnWindowFocus: false = não refetcha ao voltar a aba do navegador
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,            // mantém em cache 5min mesmo sem uso
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Após um deploy novo, os assets ganham hash novo. Se a aba ficou aberta de um
// deploy antigo, um import dinâmico (ex: jspdf no download de PDF) tenta buscar o
// arquivo velho que não existe mais → "Failed to fetch dynamically imported module".
// Solução: recarrega a página 1x pra pegar os assets novos (com trava anti-loop).
function _recoverFromStaleChunk() {
  const last = Number(sessionStorage.getItem('chunk-reload-ts') || 0)
  if (Date.now() - last < 12000) return  // evita loop de reload
  sessionStorage.setItem('chunk-reload-ts', String(Date.now()))
  window.location.reload()
}
window.addEventListener('vite:preloadError', _recoverFromStaleChunk)
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message || e?.reason || '')
  if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg)) {
    _recoverFromStaleChunk()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
