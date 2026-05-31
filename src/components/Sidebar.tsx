import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Home, Wallet, FolderKanban, Compass, Settings,
} from 'lucide-react'
import { useFamily } from '@/contexts/FamilyContext'
import { UserAvatar } from '@/components/UserAvatar'

const navItems = [
  { to: '/today',     label: 'Dashboard', icon: LayoutDashboard },
  { to: '/week',      label: 'This Week', icon: CalendarDays },
  { to: '/household', label: 'Household', icon: Home },
  { to: '/budget',    label: 'Spending',  icon: Wallet },
  { to: '/projects',  label: 'Projects',  icon: FolderKanban },
  { to: '/vision',    label: 'Vision',    icon: Compass },
]

export function Sidebar() {
  const { family, currentMember, otherMember } = useFamily()

  return (
    <aside
      className="hidden md:flex h-screen w-56 flex-shrink-0 flex-col px-3 py-6"
      style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0' }}
    >
      {/* Wordmark */}
      <div className="mb-6 px-3">
        <span className="text-base font-bold tracking-tight" style={{ color: '#0f172a' }}>
          Home Base
        </span>
        {family && (
          <p className="mt-0.5 text-xs" style={{ color: '#94a3b8' }}>{family.name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all"
            style={({ isActive }) => isActive
              ? { backgroundColor: '#eef2ff', color: '#4338ca' }
              : { color: '#64748b' }
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  color={isActive ? '#4338ca' : '#94a3b8'}
                />
                <span className={isActive ? 'font-semibold' : ''}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: members + settings */}
      <div className="space-y-1 pt-4" style={{ borderTop: '1px solid #e2e8f0' }}>
        {currentMember && (
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <UserAvatar member={currentMember} size="sm" />
            {otherMember && <UserAvatar member={otherMember} size="sm" />}
            <span className="text-xs truncate" style={{ color: '#94a3b8' }}>
              {currentMember.display_name.split(' ')[0]}
              {otherMember ? ` & ${otherMember.display_name.split(' ')[0]}` : ''}
            </span>
          </div>
        )}
        <NavLink
          to="/settings"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all"
          style={({ isActive }) => isActive
            ? { backgroundColor: '#eef2ff', color: '#4338ca' }
            : { color: '#64748b' }
          }
        >
          {({ isActive }) => (
            <>
              <Settings size={16} strokeWidth={isActive ? 2.25 : 1.75} color={isActive ? '#4338ca' : '#94a3b8'} />
              <span className={isActive ? 'font-semibold' : ''}>Settings</span>
            </>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
