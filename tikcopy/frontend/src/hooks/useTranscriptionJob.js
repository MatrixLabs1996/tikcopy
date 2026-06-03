import { useState, useEffect, useRef } from 'react'
import api from '../services/api'

/**
 * Polling de job com intervalo adaptativo — evita travar o navegador
 * quando há muitos jobs simultâneos (envio em massa).
 *
 * Estratégia:
 *  - 3s nos primeiros 30s (resposta rápida pra jobs curtos)
 *  - 6s entre 30s-2min
 *  - 12s depois de 2min (jobs longos: VSL, transcrições grandes)
 *  - Para imediatamente quando status é "done" ou "error"
 *  - Não inicia se já está terminal (caso initialJobId já concluído)
 */
function pickInterval(elapsedSec) {
  if (elapsedSec < 30)  return 3000
  if (elapsedSec < 120) return 6000
  return 12000
}

export function useTranscriptionJob(endpoint = '/transcribe', initialJobId = null) {
  const [jobId, setJobId] = useState(initialJobId)
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const timeoutRef = useRef(null)
  const startedAtRef = useRef(null)

  useEffect(() => {
    if (!jobId) return
    startedAtRef.current = Date.now()

    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await api.get(`${endpoint}/status/${jobId}`)
        if (cancelled) return
        const newStatus = res.data.status
        setStatus(newStatus)
        if (newStatus === 'done') {
          setResult(res.data.result)
          return  // não reagenda
        }
        if (newStatus === 'error') {
          setError(res.data.error || 'Erro desconhecido')
          return  // não reagenda
        }
        // Reagenda com intervalo adaptativo
        const elapsed = (Date.now() - startedAtRef.current) / 1000
        timeoutRef.current = setTimeout(poll, pickInterval(elapsed))
      } catch (e) {
        if (cancelled) return
        // Job sumiu no backend (reinício do servidor, TTL expirado) → erro definitivo.
        // IMPORTANTE: setar o STATUS, não só o erro — o card decide "rodando" por status.
        if (e?.response?.status === 404) {
          setStatus('error')
          setError('Esse job expirou no servidor (provável reinício). Refaça o envio.')
          return  // não reagenda
        }
        // Falha de rede transitória: tenta de novo na próxima rodada (não trava nem morre)
        const elapsed = (Date.now() - startedAtRef.current) / 1000
        timeoutRef.current = setTimeout(poll, pickInterval(elapsed))
      }
    }

    // Primeira chamada imediata pra UX rápida
    poll()

    return () => {
      cancelled = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [jobId, endpoint])

  const reset = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setJobId(null)
    setStatus(null)
    setResult(null)
    setError(null)
  }

  return { jobId, setJobId, status, result, error, reset }
}

export const STATUS_LABELS = {
  queued: 'Na fila...',
  downloading: 'Baixando vídeo...',
  transcribing: 'Transcrevendo...',
  organizing: 'Organizando o conteúdo em um guia...',
  translating: 'Traduzindo para português...',
  formatting: 'Formatando...',
  analyzing: 'Analisando...',
  listing: 'Listando vídeos do perfil...',
  reading_comments: 'Lendo comentários...',
  reverse_engineering: 'Fazendo engenharia reversa...',
  seven_layers: 'Extraindo as 7 camadas macro...',
  analyzing_vsl1: 'Analisando VSL 1...',
  analyzing_vsl2: 'Analisando VSL 2...',
  comparing: 'Comparando VSLs — identificando padrões...',
  saving: 'Salvando...',
  done: 'Concluído!',
  error: 'Erro',
}
