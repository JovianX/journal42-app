import { Navigate, Outlet, useLocation } from 'react-router-dom'
import AuthLoading from './AuthLoading'
import { useAuth } from './useAuth'
import { useDeferredLoading } from './useDeferredLoading'

function holdLoaderForDemo() {
  return (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('loader')
  )
}

export default function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const showLoader = useDeferredLoading(loading) || holdLoaderForDemo()

  // Auth still resolving: never redirect yet (avoids a login flash).
  if (loading && !showLoader) {
    return null
  }

  if (showLoader) {
    return <AuthLoading />
  }

  if (!user) {
    return <Navigate to={`/login${location.search}`} replace />
  }

  return <Outlet />
}
