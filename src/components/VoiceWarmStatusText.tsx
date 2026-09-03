import {
  useVoiceWarmStatus,
  voiceWarmStatusLabel,
} from '../lib/speech/useVoiceWarmStatus'

export default function VoiceWarmStatusText({
  className = '',
}: {
  className?: string
}) {
  const status = useVoiceWarmStatus()
  const label = voiceWarmStatusLabel(status)
  if (!label) return null

  return (
    <p
      className={`voice-warm-status${status.phase === 'error' ? ' is-error' : ''}${status.phase === 'ready' ? ' is-ready' : ''}${className ? ` ${className}` : ''}`}
      aria-live="polite"
    >
      {label}
    </p>
  )
}
