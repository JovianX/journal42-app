export function userLabel(displayName: string | null, email: string | null) {
  const name = displayName?.trim()
  if (name) return name
  if (email?.trim()) return email.trim()
  return 'Account'
}

export function userFirstName(displayName: string | null, email: string | null) {
  const name = displayName?.trim()
  if (name) return name.split(/\s+/)[0] ?? name
  if (email?.trim()) return email.trim().split('@')[0] ?? email.trim()
  return 'You'
}

export function userInitials(displayName: string | null, email: string | null) {
  const name = displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email?.trim()) return email.trim().slice(0, 2).toUpperCase()
  return '?'
}
