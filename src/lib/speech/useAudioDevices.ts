import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioInputDevice = {
  deviceId: string
  label: string
}

function toInputDevices(all: MediaDeviceInfo[]): AudioInputDevice[] {
  return all
    .filter((device) => device.kind === 'audioinput' && device.deviceId)
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || `Mic ${device.deviceId.slice(0, 6)}`,
    }))
}

async function enumerateInputDevices(): Promise<{
  devices: AudioInputDevice[]
  hasLabels: boolean
}> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { devices: [], hasLabels: false }
  }
  const all = await navigator.mediaDevices.enumerateDevices()
  return {
    devices: toInputDevices(all),
    hasLabels: all.some((device) => device.kind === 'audioinput' && device.label),
  }
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([])
  const requestRef = useRef<Promise<void> | null>(null)
  const deniedRef = useRef(false)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const { devices: next } = await enumerateInputDevices()
      if (!cancelledRef.current) setDevices(next)
    } catch {
      // enumerateDevices unavailable
    }
  }, [])

  const requestAccess = useCallback(async () => {
    if (deniedRef.current) return
    if (requestRef.current) return requestRef.current

    requestRef.current = (async () => {
      try {
        const listed = await enumerateInputDevices()
        if (listed.hasLabels) {
          if (!cancelledRef.current) setDevices(listed.devices)
          return
        }
        if (!navigator.mediaDevices?.getUserMedia) return
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        const next = await enumerateInputDevices()
        if (!cancelledRef.current) setDevices(next.devices)
      } catch {
        deniedRef.current = true
        await refresh()
      }
    })()

    try {
      await requestRef.current
    } finally {
      requestRef.current = null
    }
  }, [refresh])

  useEffect(() => {
    cancelledRef.current = false
    void refresh()

    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.addEventListener) {
      return () => {
        cancelledRef.current = true
      }
    }

    const onChange = () => {
      void refresh()
    }
    mediaDevices.addEventListener('devicechange', onChange)
    return () => {
      cancelledRef.current = true
      mediaDevices.removeEventListener('devicechange', onChange)
    }
  }, [refresh])

  return { devices, requestAccess }
}
