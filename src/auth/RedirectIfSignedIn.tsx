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
    const plan = params.get('plan')
    const draft = params.get('draft')
    const next = new URLSearchParams()
    if (isPaidPlan(plan)) next.set('plan', plan)
    if (draft?.trim()) next.set('draft', draft.trim())
    const query = next.toString()
    return <Navigate to={query ? `/?${query}` : '/'} replace />
  }

  return <Outlet />
}
