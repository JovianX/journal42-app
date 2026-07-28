export default function AuthLoading() {
  return (
    <div className="auth-loading" role="status" aria-live="polite">
      <div className="app-atmosphere" aria-hidden="true">
        <div className="app-orb app-orb-a" />
        <div className="app-orb app-orb-b" />
        <div className="app-grain" />
      </div>
      <div className="auth-loading-breath" aria-hidden="true">
        <span className="auth-loading-breath-core" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  )
}
