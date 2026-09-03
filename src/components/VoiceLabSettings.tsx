import { useEffect, useState } from 'react'
import type { SpeechLabSettings } from '../lib/speech/settings'

type AudioDevice = { deviceId: string; label: string }

function useAudioDevices(): AudioDevice[] {
  const [devices, setDevices] = useState<AudioDevice[]>([])

  useEffect(() => {
    let cancelled = false

    async function enumerate() {
      try {
        // Prompt permission so labels are available
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())

        const all = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setDevices(
          all
            .filter((d) => d.kind === 'audioinput')
            .map((d) => ({
              deviceId: d.deviceId,
              label: d.label || `Mic ${d.deviceId.slice(0, 6)}`,
            })),
        )
      } catch {
        // Permission denied — leave empty
      }
    }

    void enumerate()

    const onChange = () => void enumerate()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', onChange)
    }
  }, [])

  return devices
}

type VoiceLabSettingsProps = {
  settings: SpeechLabSettings
  onChange: (settings: SpeechLabSettings) => void
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="voice-lab-setting-toggle">
      <span className="voice-lab-setting-toggle-copy">
        <span className="voice-lab-setting-label">{label}</span>
        {description ? (
          <span className="voice-lab-setting-hint">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="voice-lab-setting-checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

function SelectRow<T extends string | number>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string
  description?: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <label className="voice-lab-setting-select">
      <span className="voice-lab-setting-copy">
        <span className="voice-lab-setting-label">{label}</span>
        {description ? (
          <span className="voice-lab-setting-hint">{description}</span>
        ) : null}
      </span>
      <select
        className="voice-lab-setting-control"
        value={String(value)}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function VoiceLabSettingsPanel({
  settings,
  onChange,
}: VoiceLabSettingsProps) {
  const audioDevices = useAudioDevices()

  function patchShared(patch: Partial<SpeechLabSettings['shared']>) {
    onChange({ ...settings, shared: { ...settings.shared, ...patch } })
  }

  function patchWhisper(patch: Partial<SpeechLabSettings['whisper']>) {
    onChange({ ...settings, whisper: { ...settings.whisper, ...patch } })
  }

  function patchVosk(patch: Partial<SpeechLabSettings['vosk']>) {
    onChange({ ...settings, vosk: { ...settings.vosk, ...patch } })
  }

  return (
    <section className="voice-lab-settings" aria-label="Accuracy settings">
      <div className="voice-lab-settings-head">
        <h2 className="voice-lab-settings-title">Accuracy tuning</h2>
        <p className="voice-lab-settings-lead">
          Changes apply on the next recording. Model size changes require reload.
        </p>
      </div>

      <div className="voice-lab-settings-grid">
        <div className="voice-lab-settings-group">
          <h3 className="voice-lab-settings-group-title">Shared microphone</h3>
          {audioDevices.length > 1 && (
            <SelectRow
              label="Input device"
              description="Choose which microphone to use."
              value={settings.shared.deviceId}
              options={[
                { value: '', label: 'System default' },
                ...audioDevices.map((d) => ({
                  value: d.deviceId,
                  label: d.label,
                })),
              ]}
              onChange={(value) => patchShared({ deviceId: value })}
            />
          )}
          <ToggleRow
            label="Echo cancellation"
            checked={settings.shared.echoCancellation}
            onChange={(checked) => patchShared({ echoCancellation: checked })}
          />
          <ToggleRow
            label="Noise suppression"
            checked={settings.shared.noiseSuppression}
            onChange={(checked) => patchShared({ noiseSuppression: checked })}
          />
          <ToggleRow
            label="Auto gain control"
            description="Off is often better for quiet journal speech."
            checked={settings.shared.autoGainControl}
            onChange={(checked) => patchShared({ autoGainControl: checked })}
          />
        </div>

        <div className="voice-lab-settings-group">
          <h3 className="voice-lab-settings-group-title">Whisper</h3>
          <SelectRow
            label="Model size"
            description="Base is the best starting point for accuracy."
            value={settings.whisper.modelSize}
            options={[
              { value: 'tiny', label: 'Tiny (fastest)' },
              { value: 'base', label: 'Base (balanced)' },
              { value: 'small', label: 'Small (best, slowest)' },
            ]}
            onChange={(value) => patchWhisper({ modelSize: value })}
          />
          <SelectRow
            label="Quantization"
            description="q4/q8 temporarily load fp32 until the ONNX runtime fix ships."
            value={settings.whisper.quantization}
            options={[
              { value: 'q4', label: 'q4 (smaller when available)' },
              { value: 'fp32', label: 'fp32 (reliable, larger)' },
            ]}
            onChange={(value) => patchWhisper({ quantization: value })}
          />
          <SelectRow
            label="Chunk length"
            value={settings.whisper.chunkSeconds}
            options={[
              { value: 3, label: '3 seconds' },
              { value: 6, label: '6 seconds' },
              { value: 8, label: '8 seconds' },
            ]}
            onChange={(value) => patchWhisper({ chunkSeconds: value })}
          />
          <SelectRow
            label="Chunk overlap"
            value={settings.whisper.overlapSeconds}
            options={[
              { value: 0, label: 'None' },
              { value: 1, label: '1 second' },
              { value: 2, label: '2 seconds' },
            ]}
            onChange={(value) => patchWhisper({ overlapSeconds: value })}
          />
          <SelectRow
            label="Voice activity gate"
            description="Silero uses a small ONNX model (~0.6 MB) for speech detection."
            value={settings.whisper.vadMode}
            options={[
              { value: 'off', label: 'Off (fixed chunks)' },
              { value: 'rms', label: 'RMS threshold' },
              { value: 'enhanced', label: 'Enhanced gate' },
              { value: 'silero', label: 'Silero VAD' },
            ]}
            onChange={(value) => patchWhisper({ vadMode: value })}
          />
          {settings.whisper.vadMode === 'silero' ? (
            <label className="voice-lab-setting-range">
              <span className="voice-lab-setting-copy">
                <span className="voice-lab-setting-label">Silero speech threshold</span>
                <span className="voice-lab-setting-hint">
                  Higher = stricter. Current: {settings.whisper.sileroThreshold.toFixed(2)}
                </span>
              </span>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={settings.whisper.sileroThreshold}
                onChange={(event) =>
                  patchWhisper({ sileroThreshold: Number(event.target.value) })
                }
              />
            </label>
          ) : (
            <label className="voice-lab-setting-range">
              <span className="voice-lab-setting-copy">
                <span className="voice-lab-setting-label">RMS threshold</span>
                <span className="voice-lab-setting-hint">
                  Lower = more sensitive. Current: {settings.whisper.rmsThreshold.toFixed(3)}
                </span>
              </span>
              <input
                type="range"
                min="0.005"
                max="0.03"
                step="0.001"
                value={settings.whisper.rmsThreshold}
                onChange={(event) =>
                  patchWhisper({ rmsThreshold: Number(event.target.value) })
                }
              />
            </label>
          )}
          <ToggleRow
            label="Journal prompt"
            description="Biases Whisper toward journal-style English."
            checked={settings.whisper.journalPrompt}
            onChange={(checked) => patchWhisper({ journalPrompt: checked })}
          />
          <ToggleRow
            label="Silence hallucination filter"
            description="Blocks common false positives like “you” on quiet audio."
            checked={settings.whisper.hallucinationFilter}
            onChange={(checked) => patchWhisper({ hallucinationFilter: checked })}
          />
        </div>

        <div className="voice-lab-settings-group">
          <h3 className="voice-lab-settings-group-title">Vosk</h3>
          <SelectRow
            label="Model size"
            description="Large needs a public CDN mirror; falls back with an error if unavailable."
            value={settings.vosk.modelTier}
            options={[
              { value: 'small', label: 'Small (verified)' },
              { value: 'large', label: 'Large (experimental)' },
            ]}
            onChange={(value) => patchVosk({ modelTier: value })}
          />
          <SelectRow
            label="Resampling"
            value={settings.vosk.resampling}
            options={[
              { value: 'fast', label: 'Fast' },
              { value: 'quality', label: 'Linear (better)' },
            ]}
            onChange={(value) => patchVosk({ resampling: value })}
          />
          <ToggleRow
            label="Restore punctuation"
            description="Local DistilBERT after each phrase (~67 MB). Downloaded in the background with Vosk."
            checked={settings.vosk.punctuation}
            onChange={(checked) => patchVosk({ punctuation: checked })}
          />
          <ToggleRow
            label="Word timestamps"
            description="Slightly richer decoding metadata inside Vosk."
            checked={settings.vosk.wordTimestamps}
            onChange={(checked) => patchVosk({ wordTimestamps: checked })}
          />
        </div>
      </div>
    </section>
  )
}
