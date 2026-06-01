import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Separa as libs pesadas em chunks próprios → melhor cache e
        // carregamento paralelo (o bundle único passava de 1.4 MB).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // CORE DO REACT em um chunk só (react, react-dom, scheduler, router, jsx-runtime).
          // Tem que vir ANTES de qualquer outra regra — senão deps internas (scheduler)
          // caem no 'vendor' e criam dependência circular vendor<->react-vendor → tela
          // preta em produção (o React fica indefinido no boot).
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|use-sync-external-store|@remix-run[\\/]router)[\\/]/.test(id)) {
            return 'react-vendor'
          }
          // Libs importadas dinamicamente (download.js / BriefingViewerPage) —
          // deixa o Rollup mantê-las como chunks lazy (carregam só quando usadas).
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return
          if (id.includes('/docx/') || id.includes('mammoth')) return
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor'
          if (id.includes('lucide-react')) return 'icons'
          if (/react-markdown|remark|rehype|micromark|mdast|hast|unified|vfile|\/devlop\/|property-information|character-entities|decode-named-character|space-separated|comma-separated|trim-lines|longest-streak|zwitch|\/bail\/|\/trough\/|\/ccount\/|\/escape-string-regexp\//.test(id)) return 'markdown'
          if (id.includes('react-virtuoso')) return 'virtuoso'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('@supabase')) return 'supabase'
          return 'vendor'
        },
      },
    },
  },
})
