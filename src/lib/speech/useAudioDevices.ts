import { useEffect, useState } from 'react'

export type AudioInputDevice = {
  deviceId: string
  label: string
}

export function useAudioDevices(): AudioInputDevice[] {
  const [devices, setDevices] = useState<AudioInputDevice[]>([])

  useEffect(() => {
    let cancelled = false

    async function enumerate() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())

        const all = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setDevices(
          all
            .filter((device) => device.kind === 'audioinput')
            .map((device) => ({
              deviceId: device.deviceId,
              label: device.label || `Mic ${device.deviceId.slice(0, 6)}`,
            })),
        )
      } catch {
        // Permission denied — leave empty.
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
