import type { RevealedVoiceWord } from '../lib/speech/voiceTranscriptWords'
import { VoiceComposeMicIcon } from './VoiceComposeMicIcon'

type VoiceComposeAudioSurfaceProps = {
  outputId?: string
  hearingVoice: boolean
  isLoading: boolean
  isListening: boolean
  hint: string
  recentWords: RevealedVoiceWord[]
  error: string | null
  onStop: () => void
}

export default function VoiceComposeAudioSurface({
  outputId,
  hearingVoice,
  isLoading,
  isListening,
  hint,
  recentWords,
  error,
  onStop,
}: VoiceComposeAudioSurfaceProps) {
  return (
    <div
      id={outputId}
      className={`voice-compose-audio-box${hearingVoice ? ' is-hearing' : ''}${isLoading ? ' is-loading' : ''}`}
      aria-live="polite"
      aria-atomic="true"
      aria-busy={isLoading || isListening}
    >
      <div className="voice-compose-word-slot">
        {recentWords.length > 0 ? (
          <p className="voice-compose-word-stream">
            {recentWords.map((word, index) => {
              const ageFromNewest = recentWords.length - 1 - index
              return (
                <span
                  key={word.id}
                  className={`voice-compose-word is-age-${Math.min(ageFromNewest, 3)}${word.provisional || ageFromNewest === 0 ? ' is-current' : ''}`}
                >
                  {word.text}
                </span>
              )
            })}
          </p>
        ) : (
          <p className="voice-compose-status-label">{hint}</p>
        )}
      </div>

      <div className="voice-compose-stage">
        <span
          className={`voice-compose-stage-aura${hearingVoice ? ' is-hearing' : ''}`}
          aria-hidden="true"
        />
        <button
          type="button"
          className={`voice-compose-stage-mic${isListening ? ' is-listening' : ''}`}
          onClick={onStop}
          disabled={isLoading}
          aria-label="Stop voice input"
        >
          <VoiceComposeMicIcon active={isListening} />
        </button>
      </div>

      {error ? (
        <p className="voice-compose-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
