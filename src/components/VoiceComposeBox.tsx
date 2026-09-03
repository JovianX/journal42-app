import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import VoiceComposeAudioSurface from './VoiceComposeAudioSurface'
import { VoiceComposeMicIcon } from './VoiceComposeMicIcon'
import { useVoiceCompose } from '../lib/speech/useVoiceCompose'
import type { SpeechEngineController } from '../lib/speech/types'

type VoiceComposeBoxProps = {
  engine: SpeechEngineController
  placeholder?: string
}

export default function VoiceComposeBox({
  engine,
  placeholder = "What's rattling around up there?",
}: VoiceComposeBoxProps) {
  const inputId = useId()
  const outputId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')

  const voice = useVoiceCompose(engine, {
    value: text,
    onChange: setText,
    focusInput: () => inputRef.current?.focus({ preventScroll: true }),
  })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (voice.voiceMode) return
    const value = text.trim()
    if (!value) return
    setText('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      void onSubmit(event)
    }
  }

  return (
    <section className="voice-compose-prototype" aria-label="Compose prototype">
      <div className="voice-compose-lead-wrap">
        <h2 className="voice-compose-title">Compose prototype</h2>
        <p className="voice-compose-lead">
          Tap the mic to enter audio mode. Recent words appear above the mic;
          the full transcript lands in the text box when you stop.
        </p>
      </div>

      <div
        className={`composer-stack voice-compose-stack${voice.voiceMode ? ' is-voice' : ''}${voice.hearingVoice ? ' is-hearing' : ''}`}
      >
        <form
          className={`nugget-composer-frame voice-compose-frame${voice.voiceMode ? ' is-voice' : ''}${voice.isListening ? ' is-listening' : ''}${voice.hearingVoice ? ' is-hearing' : ''}`}
          onSubmit={onSubmit}
          style={
            voice.voiceMode
              ? { ['--voice-level' as string]: String(0.55 + voice.level * 0.4) }
              : undefined
          }
        >
          <div className="nugget-composer-face voice-compose-face" aria-hidden="true" />

          <div className="nugget-composer voice-compose-inner">
            <label className="sr-only" htmlFor={inputId}>
              Write a thought
            </label>

            <div
              className={`nugget-composer-body voice-compose-surface${voice.voiceMode ? ' is-voice' : ' is-text'}`}
            >
              {voice.voiceMode ? (
                <VoiceComposeAudioSurface
                  outputId={outputId}
                  hearingVoice={voice.hearingVoice}
                  isLoading={voice.isLoading}
                  isListening={voice.isListening}
                  hint={voice.hint}
                  recentWords={voice.recentWords}
                  error={voice.error}
                  onStop={() => void voice.toggleVoiceMode()}
                />
              ) : (
                <textarea
                  id={inputId}
                  ref={inputRef}
                  className="nugget-input voice-compose-input"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={placeholder}
                  rows={1}
                />
              )}
            </div>
            <div
              className="nugget-composer-bar nugget-composer-bar-sizer"
              aria-hidden="true"
            >
              <div className="nugget-composer-actions">
                <button
                  type="button"
                  className="btn-ghost btn-icon-only voice-compose-mic"
                  tabIndex={-1}
                  disabled
                  aria-hidden="true"
                >
                  <VoiceComposeMicIcon active={false} />
                </button>
                <button
                  type="button"
                  className="btn-primary btn-icon-only"
                  tabIndex={-1}
                  disabled
                  aria-hidden="true"
                >
                  <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 3v9.2m0 0L4.3 8.5M8 12.2 11.7 8.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div
            className={`nugget-composer-bar-dock voice-compose-bar-dock${voice.voiceMode ? ' is-voice' : ''}`}
          >
            <div className="nugget-composer-bar voice-compose-bar">
              <div className="nugget-composer-actions voice-compose-actions">
                <button
                  type="button"
                  className="btn-ghost btn-icon-only voice-compose-mic"
                  onClick={() => void voice.toggleVoiceMode()}
                  disabled={voice.isLoading || voice.voiceMode}
                  aria-pressed={voice.voiceMode}
                  aria-label="Start voice input"
                  tabIndex={voice.voiceMode ? -1 : 0}
                  aria-hidden={voice.voiceMode}
                >
                  <VoiceComposeMicIcon active={false} />
                </button>
                <button
                  type="submit"
                  className="btn-primary btn-icon-only"
                  disabled={voice.voiceMode || !text.trim()}
                  aria-label="Save thought"
                  tabIndex={voice.voiceMode ? -1 : 0}
                  aria-hidden={voice.voiceMode}
                >
                  <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 3v9.2m0 0L4.3 8.5M8 12.2 11.7 8.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
