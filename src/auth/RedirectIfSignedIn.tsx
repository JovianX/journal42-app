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
    const plan = new URLSearchParams(location.search).get('plan')
    const to = isPaidPlan(plan) ? `/?plan=${plan}` : '/'
    return <Navigate to={to} replace />
  }

  return <Outlet />
}
