import { create } from 'zustand'

/**
 * Confirmação global estilizada (substitui o window.confirm nativo).
 *
 * Uso:
 *   import { confirmAction } from '../stores/useConfirmStore'
 *   if (!(await confirmAction({ title: 'Remover?', message: 'Não dá pra desfazer.' }))) return
 */
const useConfirmStore = create((set) => ({
  isOpen: false,
  opts: {},
  _resolve: null,

  open: (opts) =>
    new Promise((resolve) => {
      set({ isOpen: true, opts: opts || {}, _resolve: resolve })
    }),

  close: (result) =>
    set((s) => {
      s._resolve?.(result)
      return { isOpen: false, opts: {}, _resolve: null }
    }),
}))

/** Helper — retorna Promise<boolean>. */
export function confirmAction(opts) {
  return useConfirmStore.getState().open(opts)
}

/**
 * Helper de múltipla escolha — abre o mesmo modal mas com vários botões.
 * Resolve com o `value` do botão clicado, ou `null` se cancelar/fechar.
 *
 * Uso:
 *   const r = await chooseAction({
 *     title: 'Começar uma copy nova?',
 *     message: 'O que fazer com o que está escrito?',
 *     choices: [
 *       { label: 'Salvar no rascunho', value: 'save', primary: true },
 *       { label: 'Excluir', value: 'discard', danger: true },
 *     ],
 *   })
 *   if (r === 'save') ... ; if (r === 'discard') ... ; if (r === null) cancelou
 */
export function chooseAction(opts) {
  return useConfirmStore.getState().open({ ...opts, _choices: opts.choices || [] })
}

export default useConfirmStore
