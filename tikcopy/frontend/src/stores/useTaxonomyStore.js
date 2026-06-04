import { useMemo } from 'react'
import { create } from 'zustand'
import api from '../services/api'
import { NICHOS_PRESET, FORMATOS_PRESET } from '../pages/SwipePage'

/**
 * Taxonomia global de tags: nichos e formatos.
 * Junta os PRESETS fixos com tudo que o usuário JÁ criou (via /swipes/taxonomy),
 * pra que uma tag custom criada em um vídeo apareça nos dropdowns de TODOS os outros.
 */
const dedupe = (arr) => Array.from(new Set(arr.filter(Boolean)))

const useTaxonomyStore = create((set, get) => ({
  customNiches: [],
  customFormats: [],
  loaded: false,

  load: async () => {
    try {
      const res = await api.get('/swipes/taxonomy')
      set({
        customNiches: res.data.niches || [],
        customFormats: res.data.formats || [],
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  // Adiciona otimisticamente (aparece na hora, antes do reload)
  addNiche: (n) => {
    const v = (n || '').trim()
    if (!v) return
    set((s) => (s.customNiches.includes(v) ? {} : { customNiches: [...s.customNiches, v] }))
  },
  addFormat: (f) => {
    const v = (f || '').trim()
    if (!v) return
    set((s) => (s.customFormats.includes(v) ? {} : { customFormats: [...s.customFormats, v] }))
  },
}))

// Selectors — listas merged (presets ∪ custom), presets primeiro.
// IMPORTANTE: seleciona só o array bruto (referência estável do store) e faz o
// merge num useMemo. Fazer o merge dentro do selector cria um array novo a cada
// render → quebra o cache do useSyncExternalStore → loop infinito.
export const useAllNiches = () => {
  const customNiches = useTaxonomyStore((s) => s.customNiches)
  return useMemo(() => dedupe([...NICHOS_PRESET, ...customNiches]), [customNiches])
}

export const useAllFormats = () => {
  const customFormats = useTaxonomyStore((s) => s.customFormats)
  return useMemo(() => dedupe([...FORMATOS_PRESET, ...customFormats]), [customFormats])
}

export default useTaxonomyStore
