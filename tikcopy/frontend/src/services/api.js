import axios from 'axios'
import { supabase } from './supabase'

// Fallback no 8010 (porta do backend local). A 8000 era um default antigo e
// não é usada — apontar pra ela quebrava o carregamento quando o VITE_API_URL
// não era lido pelo dev server.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8010',
})

// Inject Supabase JWT on every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
