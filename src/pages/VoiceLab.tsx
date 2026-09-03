import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import VoiceComposeBox from '../components/VoiceComposeBox'
import VoiceLabSettingsPanel from '../components/VoiceLabSettings'
import { SPEECH_ENGINE_META } from '../lib/speech/meta'
import type { SpeechEngineController, SpeechEngineId } from '../lib/speech/types'
import { useSpeechLabSettings } from '../lib/speech/useSpeechLabSettings'
import { useVoskEngine } from '../lib/speech/useVoskEngine'
import { useWebSpeechEngine } from '../lib/speech/useWebSpeechEngine'
import { useWhisperEngine } from '../lib/speech/useWhisperEngine'

type EnginePanelProps = {
  meta: (typeof SPEECH_ENGINE_META)[number]
  engine: SpeechEngineController
  active: boolean
  onActivate: () => void
  onDeactivate: () => void
}

function formatMs(value: number | null) {
  if (value === null) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function statusLabel(status: SpeechEngineController['status']) {
  switch (status) {
    case 'unsupported':
      return 'Unsupported'
    case 'idle':
      return 'Idle'
    case 'loading':
      return 'Loading model'
    case 'ready':
      return 'Ready'
    case 'listening':
      return 'Listening'
    case 'processing':
      return 'Processing'
    case 'error':
      return 'Error'
    default:
      return status
  }
}

function EnginePanel({
  meta,
  engine,
  active,
  onActivate,
  onDeactivate,
}: EnginePanelProps) {
  const outputId = useId()
  const needsModel = meta.id !== 'web-speech'
  const isListening = engine.status === 'listening' || engine.status === 'processing'
  const displayText = `${engine.finalText}${engine.interimText ? engine.interimText : ''}`.trim()

  async function onToggleListen() {
    if (isListening) {
      engine.stop()
      onDeactivate()
      return
    }

    onActivate()
    if (needsModel && (!engine.isModelReady() || engine.requiresReload)) {
      const ready = await engine.loadModel()
      if (!ready) return
    }
    await engine.start()
  }

  return (
    <article
      className={`voice-lab-card${active ? ' is-active' : ''}${isListening ? ' is-listening' : ''}`}
    >
      <header className="voice-lab-card-head">
        <div>
          <h2 className="voice-lab-card-title">{meta.title}</h2>
          <p className="voice-lab-card-subtitle">{meta.subtitle}</p>
        </div>
        <span
          className={`voice-lab-privacy voice-lab-privacy-${meta.privacy}`}
        >
          {meta.privacy === 'local' ? 'On device' : 'Cloud'}
        </span>
      </header>

      <p className="voice-lab-card-note">{meta.modelNote}</p>

      {engine.requiresReload ? (
        <p className="voice-lab-reload-note" role="status">
          Settings changed. Reload the model before speaking.
        </p>
      ) : null}

      <div className="voice-lab-status-row">
        <span className={`voice-lab-status voice-lab-status-${engine.status}`}>
          {statusLabel(engine.status)}
        </span>
        <span className="voice-lab-status-detail">{engine.statusDetail}</span>
      </div>

      {engine.error ? (
        <p className="voice-lab-error" role="alert">
          {engine.error}
        </p>
      ) : null}

      <div className="voice-lab-metrics" aria-label="Performance metrics">
        <div>
          <span className="voice-lab-metric-label">Model load</span>
          <span className="voice-lab-metric-value">{formatMs(engine.loadMs)}</span>
        </div>
        <div>
          <span className="voice-lab-metric-label">Last update</span>
          <span className="voice-lab-metric-value">{formatMs(engine.lastUpdateMs)}</span>
        </div>
        <div>
          <span className="voice-lab-metric-label">Updates</span>
          <span className="voice-lab-metric-value">{engine.updateCount}</span>
        </div>
      </div>

      <label className="sr-only" htmlFor={outputId}>
        Transcript for {meta.title}
      </label>
      <div
        id={outputId}
        className="voice-lab-output"
        aria-live="polite"
        aria-atomic="false"
      >
        {displayText ? (
          <p className="voice-lab-output-text">
            <span>{engine.finalText}</span>
            {engine.interimText ? (
              <span className="voice-lab-output-interim">{engine.interimText}</span>
            ) : null}
          </p>
        ) : (
          <p className="voice-lab-output-placeholder">
            Tap the mic and start talking. Your words will appear here.
          </p>
        )}
      </div>

      <div className="voice-lab-actions">
        {needsModel ? (
          <button
            type="button"
            className="btn-ghost voice-lab-load-btn"
            onClick={() => void engine.loadModel()}
            disabled={engine.status === 'loading' || engine.status === 'listening'}
          >
            {engine.status === 'loading'
              ? 'Loading…'
              : engine.loadMs
                ? 'Reload model'
                : 'Load model'}
          </button>
        ) : null}
        <button
          type="button"
          className={`btn-primary voice-lab-mic-btn${isListening ? ' is-recording' : ''}`}
          onClick={() => void onToggleListen()}
          disabled={engine.status === 'unsupported' || engine.status === 'loading'}
          aria-pressed={isListening}
        >
          <svg className="btn-icon" viewBox="0 0 16 16" aria-hidden="true">
            {isListening ? (
              <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="currentColor" />
            ) : (
              <>
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
                <path d="M8 11.1v2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </>
            )}
          </svg>
          {isListening ? 'Stop' : 'Speak'}
        </button>
        <button
          type="button"
          className="btn-ghost voice-lab-clear-btn"
          onClick={engine.clear}
          disabled={!engine.finalText && !engine.interimText}
        >
          Clear
        </button>
      </div>
    </article>
  )
}

export default function VoiceLab() {
  const [settings, setSettings] = useSpeechLabSettings()
  const webSpeech = useWebSpeechEngine()
  const whisper = useWhisperEngine(settings)
  const vosk = useVoskEngine(settings)
  const [activeId, setActiveId] = useState<SpeechEngineId | null>(null)

  const engines: Record<SpeechEngineId, SpeechEngineController> = {
    'web-speech': webSpeech,
    whisper,
    vosk,
  }

  useEffect(() => {
    document.title = 'Journal42 · Voice input lab'
    return () => {
      document.title = 'Journal42'
    }
  }, [])

  function stopOthers(activeId: SpeechEngineId) {
    for (const meta of SPEECH_ENGINE_META) {
      if (meta.id === activeId) continue
      engines[meta.id].stop()
    }
  }

  function handleActivate(id: SpeechEngineId) {
    if (activeId && activeId !== id) {
      engines[activeId].stop()
    }
    if (id !== 'vosk') {
      vosk.stop()
    }
    stopOthers(id)
    setActiveId(id)
  }

  function handleDeactivate(id: SpeechEngineId) {
    setActiveId((current) => (current === id ? null : current))
  }

  function clearAll() {
    for (const meta of SPEECH_ENGINE_META) {
      engines[meta.id].clear()
    }
  }

  return (
    <div className="app-shell settings-shell voice-lab-shell">
      <div className="app-atmosphere" aria-hidden="true">
        <div className="app-orb app-orb-a" />
        <div className="app-orb app-orb-b" />
        <div className="app-grain" />
      </div>

      <header className="app-header">
        <Link className="app-logo" to="/" aria-label="Journal42 home">
          Journal<span>42</span>
        </Link>
        <Link className="settings-back" to="/">
          <span aria-hidden="true">←</span> Journal
        </Link>
      </header>

      <main className="app-main voice-lab-main">
        <section className="voice-lab-intro">
          <h1 className="voice-lab-title">Voice input lab</h1>
          <p className="voice-lab-lead">
            Compare three ways to turn speech into text. Only one panel records at a
            time. Local engines download a model on first use — give them a minute on
            slower connections.
          </p>
          <div className="voice-lab-intro-actions">
            <button type="button" className="btn-ghost" onClick={clearAll}>
              Clear all panels
            </button>
          </div>
        </section>

        <VoiceComposeBox engine={vosk} />

        <VoiceLabSettingsPanel
          settings={settings}
          onChange={setSettings}
        />

        <div className="voice-lab-grid">
          {SPEECH_ENGINE_META.map((meta) => (
            <EnginePanel
              key={meta.id}
              meta={meta}
              engine={engines[meta.id]}
              active={activeId === meta.id}
              onActivate={() => handleActivate(meta.id)}
              onDeactivate={() => handleDeactivate(meta.id)}
            />
          ))}
        </div>

        <section className="voice-lab-tips" aria-label="Comparison tips">
          <h2 className="voice-lab-tips-title">What to compare</h2>
          <ul className="voice-lab-tips-list">
            <li>
              <strong>Latency:</strong> how quickly text appears after you start talking.
            </li>
            <li>
              <strong>While speaking:</strong> Web Speech and Vosk show partial text;
              Whisper updates in ~2 second chunks.
            </li>
            <li>
              <strong>Accuracy:</strong> try half-thoughts, pauses, and background noise.
            </li>
            <li>
              <strong>Privacy:</strong> only Whisper and Vosk keep audio on your device.
            </li>
          </ul>
        </section>
      </main>
    </div>
  )
}
