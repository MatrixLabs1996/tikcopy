import useEditorGuard from './useEditorGuard'
import { chooseAction } from './useConfirmStore'

/**
 * Navega via react-router, mas se o editor de copy estiver com edições não salvas,
 * abre um pop-up perguntando: Finalizar / Salvar rascunho / Sair sem salvar / Cancelar.
 *
 * Usado pela Sidebar (e qualquer ponto que mude de página) pra não perder copy.
 */
export async function guardedNavigate(navigate, to) {
  const guard = useEditorGuard.getState()

  // Editor não montado, ou sem mudanças → navega direto
  if (!guard.active || !guard.isDirty || !guard.isDirty()) {
    navigate(to)
    return
  }

  const choice = await chooseAction({
    title: 'Você tem alterações não salvas',
    message: 'O que deseja fazer com a copy antes de sair?',
    choices: [
      { label: 'Salvar rascunho', value: 'draft', primary: true },
      { label: 'Finalizar anúncio', value: 'final' },
      { label: 'Sair sem salvar', value: 'discard', danger: true },
    ],
    cancelLabel: 'Continuar editando',
  })

  if (choice === null) return // cancelou — fica na página

  if (choice === 'draft') {
    const ok = await guard.saveDraft?.()
    if (ok === false) return  // falha ao salvar → não navega pra não perder
  } else if (choice === 'final') {
    const ok = await guard.finalize?.()
    if (ok === false) return
  }
  // 'discard' ou save ok → navega
  navigate(to)
}
