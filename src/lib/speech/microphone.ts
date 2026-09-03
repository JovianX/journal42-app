import type { SpeechLabSettings } from './settings'

export type MicrophoneSession = {
  stream: MediaStream
  audioContext: AudioContext
  sampleRate: number
}

export async function openMicrophone(
  audioSettings: SpeechLabSettings['shared'],
): Promise<MicrophoneSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: audioSettings.echoCancellation,
      noiseSuppression: audioSettings.noiseSuppression,
      autoGainControl: audioSettings.autoGainControl,
    },
  })

  const audioContext = new AudioContext()
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  return {
    stream,
    audioContext,
    sampleRate: audioContext.sampleRate,
  }
}

export function closeMicrophone(session: MicrophoneSession | null) {
  if (!session) return
  session.stream.getTracks().forEach((track) => track.stop())
  void session.audioContext.close()
}
