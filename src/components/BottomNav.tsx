import { NavLink } from 'react-router-dom'
import { Sun, CalendarDays, Home, Lock, Settings } from 'lucide-react'

const navItems = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/week', label: 'Week', icon: CalendarDays },
  { to: '/household', label: 'Household', icon: Home },
  { to: '/vault', label: 'Vault', icon: Lock },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-gray-100 bg-white md:hidden">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
              isActive ? 'text-gray-900' : 'text-gray-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
