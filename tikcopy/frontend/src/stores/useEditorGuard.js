import { create } from 'zustand'

/**
 * Guarda de navegação do editor de copy.
 *
 * O CopyEditorPage se "registra" enquanto está montado, expondo:
 *  - isDirty(): há mudanças não salvas no backend?
 *  - saveDraft(): Promise<bool> — salva como rascunho
 *  - finalize(): Promise<bool> — salva como AD finalizado
 *
 * A Sidebar (e qualquer ponto de navegação) consulta isso antes de sair da
 * página, pra perguntar se o usuário quer salvar.
 */
const useEditorGuard = create((set) => ({
  active: false,
  isDirty: () => false,
  saveDraft: null,
  finalize: null,

  register: (cfg) => set({ active: true, ...cfg }),
  unregister: () =>
    set({ active: false, isDirty: () => false, saveDraft: null, finalize: null }),
}))

export default useEditorGuard
