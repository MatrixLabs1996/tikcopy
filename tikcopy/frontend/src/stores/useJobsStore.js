import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

/**
 * Store GLOBAL de jobs de transcrição (background).
 *
 * Por que existe: antes o polling vivia dentro de cada página. Ao trocar de aba,
 * o componente desmontava e a transcrição "parava" (perdia o resultado).
 * Agora os jobs vivem aqui (persistido em localStorage) e um poller global
 * (em AppLayout) acompanha TODOS, independente de qual página está aberta.
 *
 * job = {
 *   id,            // job_id retornado pelo backend
 *   kind,          // 'organic' | 'ad' | 'vsl' | 'lesson'
 *   endpoint,      // '/transcribe' | '/ads' | '/vsl'  (base do /status/{id})
 *   label,         // nome do arquivo ou URL (pra mostrar)
 *   status,        // queued | downloading | transcribing | ... | done | error
 *   result,        // resultado quando done
 *   error,
 *   projectId, niche, saveToMemory, translate,
 *   batch,         // id do lote (agrupa vários de um envio)
 *   createdAt,
 * }
 */
const useJobsStore = create(
  persist(
    (set, get) => ({
      jobs: [],

      addJobs: (newJobs) =>
        set((s) => ({
          jobs: [
            ...newJobs.map((j) => ({ status: 'queued', createdAt: Date.now(), ...j })),
            ...s.jobs,
          ],
        })),

      updateJob: (id, patch) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),

      removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

      // Limpa concluídos (opcionalmente de um kind específico)
      clearDone: (kind) =>
        set((s) => ({
          jobs: s.jobs.filter(
            (j) => !(j.status === 'done' && (!kind || j.kind === kind))
          ),
        })),

      // Limpa TUDO de um kind (ou tudo)
      clearKind: (kind) =>
        set((s) => ({ jobs: kind ? s.jobs.filter((j) => j.kind !== kind) : [] })),
    }),
    {
      name: 'tikcopy-jobs',
      // Não persiste jobs com erro velho — só o essencial
      partialize: (s) => ({ jobs: s.jobs }),
    }
  )
)

const TERMINAL = new Set(['done', 'error'])
export const isActive = (job) => !TERMINAL.has(job.status)

/**
 * Faz UMA rodada de polling em todos os jobs ativos.
 * Chamado em intervalo pelo poller global.
 */
export async function pollActiveJobs() {
  const { jobs, updateJob } = useJobsStore.getState()
  const active = jobs.filter(isActive)
  if (!active.length) return

  await Promise.all(
    active.map(async (j) => {
      try {
        const res = await api.get(`${j.endpoint}/status/${j.id}`)
        const st = res.data.status
        if (st === 'done') {
          updateJob(j.id, { status: 'done', result: res.data.result, progress: null })
        } else if (st === 'error') {
          updateJob(j.id, { status: 'error', error: res.data.error || 'Erro desconhecido' })
        } else {
          // progress só existe em alguns jobs (ex: Raio-X transcrevendo i/N)
          updateJob(j.id, { status: st, progress: res.data.progress || null })
        }
      } catch (e) {
        // Job expirou no backend (reinício, etc.) → marca erro
        if (e?.response?.status === 404) {
          updateJob(j.id, { status: 'error', error: 'Job expirou no servidor' })
        }
        // Outros erros (rede): ignora, tenta de novo na próxima rodada
      }
    })
  )
}

export default useJobsStore
