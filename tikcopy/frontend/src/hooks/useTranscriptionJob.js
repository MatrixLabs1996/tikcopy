import { useState, useEffect, useRef } from 'react'
import api from '../services/api'

export function useTranscriptionJob(endpoint = '/transcribe') {
  const [jobId, setJobId] = useState(null)
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!jobId) return

    intervalRef.current = setInterval(async () => {
      try {
        const res = await api.get(`${endpoint}/status/${jobId}`)
        setStatus(res.data.status)
        if (res.data.status === 'done') {
          setResult(res.data.result)
          clearInterval(intervalRef.current)
        } else if (res.data.status === 'error') {
          setError(res.data.error || 'Erro desconhecido')
          clearInterval(intervalRef.current)
        }
      } catch {
        setError('Falha ao verificar status do job')
        clearInterval(intervalRef.current)
      }
    }, 2000)

    return () => clearInterval(intervalRef.current)
  }, [jobId, endpoint])

  const reset = () => {
    clearInterval(intervalRef.current)
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
  formatting: 'Formatando com IA...',
  analyzing: 'Analisando com Gemini...',
  saving: 'Salvando...',
  done: 'Concluído!',
  error: 'Erro',
}
