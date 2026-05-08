import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <div style={{
        marginLeft: 'var(--sidebar-width)',
        marginTop: 'var(--topbar-height)',
        flex: 1,
        overflowY: 'auto',
        padding: '28px 32px',
        maxWidth: '900px',
      }}>
        <Topbar />
        <Outlet />
      </div>
    </div>
  )
}
