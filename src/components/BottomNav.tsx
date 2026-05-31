import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CalendarDays, Home, Wallet, FolderKanban } from 'lucide-react'

const navItems = [
  { to: '/today',     label: 'Home',      icon: LayoutDashboard },
  { to: '/week',      label: 'Week',      icon: CalendarDays },
  { to: '/household', label: 'Household', icon: Home },
  { to: '/budget',    label: 'Spending',  icon: Wallet },
  { to: '/projects',  label: 'Projects',  icon: FolderKanban },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden"
      style={{
        backgroundColor: 'rgba(6, 4, 18, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.07)',
      }}
    >
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[10px] font-medium transition-colors"
          style={({ isActive }) => ({
            color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.28)',
          })}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full"
                  style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                />
              )}
              <Icon size={21} strokeWidth={isActive ? 2.25 : 1.6} />
              <span className={isActive ? 'font-semibold' : ''}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
