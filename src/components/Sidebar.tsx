import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  Home,
  Wallet,
  FolderKanban,
  Compass,
  Settings,
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
      style={{
        backgroundColor: 'rgba(6, 4, 18, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Wordmark */}
      <div className="mb-6 px-3">
        <span className="text-base font-bold tracking-tight text-white">
          Home Base
        </span>
        {family && (
          <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {family.name}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'text-white'
                  : 'hover:text-white/80'
              }`
            }
            style={({ isActive }) => isActive
              ? {
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(124,58,237,0.15) 100%)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  color: 'white',
                }
              : { color: 'rgba(255,255,255,0.40)' }
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  style={{ color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.40)' }}
                />
                <span className={isActive ? 'font-semibold' : ''}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: members + settings */}
      <div className="space-y-1 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Who's here */}
        {currentMember && (
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <UserAvatar member={currentMember} size="sm" />
            {otherMember && <UserAvatar member={otherMember} size="sm" />}
            <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {currentMember.display_name.split(' ')[0]}
              {otherMember ? ` & ${otherMember.display_name.split(' ')[0]}` : ''}
            </span>
          </div>
        )}

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              isActive ? 'text-white' : 'hover:text-white/80'
            }`
          }
          style={({ isActive }) => isActive
            ? {
                background: 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(124,58,237,0.15) 100%)',
                border: '1px solid rgba(99,102,241,0.25)',
                color: 'white',
              }
            : { color: 'rgba(255,255,255,0.40)' }
          }
        >
          {({ isActive }) => (
            <>
              <Settings
                size={16}
                strokeWidth={isActive ? 2.25 : 1.75}
                style={{ color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.40)' }}
              />
              <span className={isActive ? 'font-semibold' : ''}>Settings</span>
            </>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
