import { useAudioDevices } from '../lib/speech/useAudioDevices'

type SettingsMicrophoneSelectProps = {
  value: string
  onChange: (deviceId: string) => void
  disabled?: boolean
}

export default function SettingsMicrophoneSelect({
  value,
  onChange,
  disabled = false,
}: SettingsMicrophoneSelectProps) {
  const { devices, requestAccess } = useAudioDevices()
  const savedMissing =
    Boolean(value) && !devices.some((device) => device.deviceId === value)

  return (
    <label className="settings-field settings-field-inline">
      <span className="sr-only">Microphone</span>
      <select
        className="settings-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPointerDown={() => {
          void requestAccess()
        }}
        onFocus={() => {
          void requestAccess()
        }}
        disabled={disabled}
        aria-label="Microphone"
      >
        <option value="">System default</option>
        {savedMissing ? <option value={value}>Saved microphone</option> : null}
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </label>
  )
}
