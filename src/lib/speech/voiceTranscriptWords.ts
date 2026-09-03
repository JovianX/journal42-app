export type VoiceWordKind = 'final' | 'partial' | 'current'

export type VoiceWordToken = {
  text: string
  key: string
  kind: VoiceWordKind
}

function shouldGlueToPrevious(previous: string, next: string) {
  if (next === "'" || next === '’') return true
  if (/^'[a-z]{1,4}$/i.test(next)) return true
  if (/^[,;.!?:?%)\]}]/.test(next)) return true
  if (/['’]$/.test(previous) && /^[a-z]+$/i.test(next)) return true
  return false
}

export function coalesceSpeechWords(words: string[]) {
  const merged: string[] = []

  for (const word of words) {
    if (!word) continue
    const previous = merged[merged.length - 1]
    if (previous && shouldGlueToPrevious(previous, word)) {
      merged[merged.length - 1] = `${previous}${word}`
      continue
    }
    merged.push(word)
  }

  return merged
}

function splitSpeechWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean)
}

export function buildVoiceWordTokens(
  finalText: string,
  interimText: string,
  isListening: boolean,
): VoiceWordToken[] {
  const finalWords = coalesceSpeechWords(splitSpeechWords(finalText))
  const interimWords = coalesceSpeechWords(splitSpeechWords(interimText))
  const tokens: VoiceWordToken[] = finalWords.map((text, index) => ({
    text,
    key: `final-${index}-${text}`,
    kind: 'final',
  }))

  interimWords.forEach((text, index) => {
    const isLast = index === interimWords.length - 1
    tokens.push({
      text,
      key: `interim-${finalWords.length + index}-${text}`,
      kind: isLast && isListening ? 'current' : 'partial',
    })
  })

  if (isListening && tokens.length > 0 && interimWords.length === 0) {
    const last = tokens[tokens.length - 1]
    if (last) {
      tokens[tokens.length - 1] = { ...last, kind: 'current' }
    }
  }

  return tokens
}

export function latestDetectedWord(finalText: string, interimText: string) {
  const words = speechWordsFromTranscript(finalText, interimText)
  return words[words.length - 1] ?? ''
}

export function speechWordsFromTranscript(finalText: string, interimText: string) {
  return coalesceSpeechWords([
    ...splitSpeechWords(finalText),
    ...splitSpeechWords(interimText),
  ])
}

export type RevealedVoiceWord = {
  id: number
  text: string
  provisional: boolean
}

/** Keep stable ids so only newly detected words remount and slide in. */
export function syncRevealedVoiceWords(
  previous: RevealedVoiceWord[],
  nextWords: string[],
  idCounter: { current: number },
): RevealedVoiceWord[] {
  if (nextWords.length === 0) return []

  const kept = previous.slice(0, Math.min(previous.length, nextWords.length)).map(
    (word, index) => ({
      ...word,
      text: nextWords[index] ?? word.text,
      provisional: index === nextWords.length - 1,
    }),
  )

  for (let index = kept.length; index < nextWords.length; index += 1) {
    idCounter.current += 1
    kept.push({
      id: idCounter.current,
      text: nextWords[index] ?? '',
      provisional: index === nextWords.length - 1,
    })
  }

  return kept
}

export function mergeVoiceTranscript(finalText: string, interimText: string) {
  const words = coalesceSpeechWords([
    ...splitSpeechWords(finalText),
    ...splitSpeechWords(interimText),
  ])
  return normalizeTranscriptSpacing(words.join(' '))
}

export function normalizeTranscriptSpacing(text: string) {
  return text
    .replace(/\s+(['’])/g, '$1')
    .replace(/(['’])\s+/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
