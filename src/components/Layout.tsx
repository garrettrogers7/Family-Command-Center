import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { BottomNav } from '@/components/BottomNav'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#0d0d14' }}>
      {/* Sidebar — desktop only */}
      <Sidebar />

      {/* Main content — extra bottom padding on mobile for the tab bar */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <BottomNav />
    </div>
  )
}
