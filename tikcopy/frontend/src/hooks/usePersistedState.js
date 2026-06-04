import { useState, useEffect, useRef } from 'react'

// Sinal global pra suprimir o "flush no unmount" (usado quando o usuário descarta
// a copy: queremos que o localStorage fique limpo, sem o flush regravar o estado
// velho durante a desmontagem do componente).
let _suppressFlush = false
export function suppressNextFlush() {
  _suppressFlush = true
  // Reseta no próximo macrotask — só afeta a desmontagem iminente.
  setTimeout(() => { _suppressFlush = false }, 0)
}

/**
 * useState que persiste em localStorage automaticamente.
 *
 * Uso:
 *   const [title, setTitle] = usePersistedState('copy-editor:title', '')
 *
 * - Salva no localStorage a cada mudança (debounced 300ms)
 * - Lê do localStorage no mount inicial
 * - `reset()` zera pro initialValue e limpa do storage
 * - `clear()` apaga do storage SEM mexer no estado atual
 */
export default function usePersistedState(key, initialValue) {
  // Lê do storage no primeiro render (lazy init pra não rodar todo render)
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null || raw === undefined) return initialValue
      return JSON.parse(raw)
    } catch {
      return initialValue
    }
  })

  // Grava o valor no localStorage AGORA (sem debounce).
  const writeNow = (k, v) => {
    try {
      if (v === undefined || v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, JSON.stringify(v))
    } catch (err) {
      // Quota cheia ou JSON inválido — ignora silenciosamente
      console.warn('[usePersistedState] erro ao salvar', k, err)
    }
  }

  // Mantém sempre o último estado/chave acessíveis no cleanup de unmount.
  const latestRef = useRef({ key, state })
  latestRef.current = { key, state }

  // Debounce de save pra evitar gravar a cada keystroke.
  const timeoutRef = useRef(null)
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => writeNow(key, state), 300)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [key, state])

  // FLUSH no unmount: garante que a última edição seja salva mesmo se o usuário
  // sair da página antes do debounce de 300ms disparar (bug: edição se perdia).
  useEffect(() => {
    return () => {
      if (_suppressFlush) return  // descarte em andamento: não regrava o estado velho
      const { key: k, state: v } = latestRef.current
      writeNow(k, v)
    }
  }, [])

  const reset = () => {
    setState(initialValue)
    try { localStorage.removeItem(key) } catch {}
  }

  return [state, setState, reset]
}

/**
 * Utilitário pra limpar múltiplas keys de uma vez (botão "Novo").
 */
export function clearPersistedKeys(...keys) {
  for (const k of keys) {
    try { localStorage.removeItem(k) } catch {}
  }
}
