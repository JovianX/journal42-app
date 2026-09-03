export function VoiceComposeMicIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 2.2a2.3 2.3 0 0 0-2.3 2.3v3.4A2.3 2.3 0 0 0 8 10.2a2.3 2.3 0 0 0 2.3-2.3V4.5A2.3 2.3 0 0 0 8 2.2Z"
        fill="currentColor"
      />
      <path
        d="M4.8 7.1v.6a3.2 3.2 0 0 0 6.4 0v-.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8 11.1v2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
