import { Navigate } from 'react-router-dom'
import useAppStore from '../stores/useAppStore'

export default function ProtectedRoute({ children }) {
  const user = useAppStore((s) => s.user)
  const authReady = useAppStore((s) => s.authReady)

  if (!authReady) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}
