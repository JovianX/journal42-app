import { Navigate, Outlet, useLocation } from 'react-router-dom'
import AuthLoading from './AuthLoading'
import { isPaidPlan } from '../lib/billing'
import { useAuth } from './useAuth'
import { useDeferredLoading } from './useDeferredLoading'

function holdLoaderForDemo() {
  return (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('loader')
  )
}

function safeNextPath(value: string | null) {
  if (!value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  if (value.startsWith('/login') || value.startsWith('/signup')) return null
  return value
}

export default function RedirectIfSignedIn() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const showLoader = useDeferredLoading(loading) || holdLoaderForDemo()

  // Auth still resolving: don't paint login, then bounce away.
  if (loading && !showLoader) {
    return null
  }

  if (showLoader) {
    return <AuthLoading />
  }

  if (user) {
    const params = new URLSearchParams(location.search)
    const next = safeNextPath(params.get('next'))
    if (next) {
      return <Navigate to={next} replace />
    }
    const plan = params.get('plan')
    const draft = params.get('draft')
    const nextParams = new URLSearchParams()
    if (isPaidPlan(plan)) nextParams.set('plan', plan)
    if (draft?.trim()) nextParams.set('draft', draft.trim())
    const query = nextParams.toString()
    return <Navigate to={query ? `/?${query}` : '/'} replace />
  }

  return <Outlet />
}
