import { Navigate, Outlet } from 'react-router-dom'
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

export default function RedirectIfSignedIn() {
  const { user, loading } = useAuth()
  const showLoader = useDeferredLoading(loading) || holdLoaderForDemo()

  // Auth still resolving: don't paint login, then bounce away.
  if (loading && !showLoader) {
    return null
  }

  if (showLoader) {
    return <AuthLoading />
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
