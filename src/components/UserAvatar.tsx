import type { FamilyMember } from '@/lib/database.types'

const colorClasses = {
  blue: 'bg-blue-100 text-blue-600 ring-blue-200',
  coral: 'bg-coral-100 text-coral-600 ring-coral-200',
}

interface Props {
  member: FamilyMember
  size?: 'sm' | 'md'
}

export function UserAvatar({ member, size = 'md' }: Props) {
  const classes = colorClasses[member.color]
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm'
  const initial = member.display_name.charAt(0).toUpperCase()

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium ring-1 ${classes} ${sizeClasses}`}
      title={member.display_name}
    >
      {initial}
    </span>
  )
}
