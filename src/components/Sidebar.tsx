import { NavLink } from 'react-router-dom'
import {
  Sun,
  CalendarDays,
  Home,
  Wallet,
  Settings,
} from 'lucide-react'
import { useFamily } from '@/contexts/FamilyContext'
import { UserAvatar } from '@/components/UserAvatar'

const navItems = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/week', label: 'This Week', icon: CalendarDays },
  { to: '/household', label: 'Household', icon: Home },
  { to: '/budget', label: 'Budget', icon: Wallet },
]

export function Sidebar() {
  // Hidden on mobile — BottomNav handles navigation there
  const { family, currentMember, otherMember } = useFamily()

  return (
    <aside className="hidden md:flex h-screen w-56 flex-col border-r border-gray-100 bg-white px-3 py-5">
      {/* Wordmark */}
      <div className="mb-8 px-2">
        <span className="text-lg font-semibold tracking-tight text-gray-900">
          Home Base
        </span>
        {family && (
          <p className="mt-0.5 text-xs text-gray-400">{family.name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: members + settings */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        {/* Who's here */}
        <div className="flex items-center gap-2 px-2">
          {currentMember && <UserAvatar member={currentMember} size="sm" />}
          {otherMember && <UserAvatar member={otherMember} size="sm" />}
          {currentMember && (
            <span className="text-xs text-gray-400">
              {currentMember.display_name}
              {otherMember ? ` & ${otherMember.display_name}` : ''}
            </span>
          )}
        </div>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`
          }
        >
          <Settings size={16} strokeWidth={1.75} />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
