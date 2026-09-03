import type { TokenClassificationPipeline } from '@huggingface/transformers'

const PUNCTUATION_MODEL_ID = 'ldenoue/distilbert-base-re-punctuate'
const SEGMENT_WORDS = 150
const SEGMENT_OVERLAP = 50

type PunctuationToken = { word: string; entity: string }

let classifierPromise: Promise<TokenClassificationPipeline> | null = null

function punctuateWordpiece(wordpiece: string, label: string) {
  let output = wordpiece
  if (label.startsWith('UPPER')) {
    output = output.toUpperCase()
  } else if (label.startsWith('Upper')) {
    output = output.charAt(0).toUpperCase() + output.slice(1)
  }

  const punct = label.at(-1)
  if (punct && punct !== '_' && !output.endsWith(punct)) {
    output += punct
  }

  return output
}

function tokensToPunctuatedText(tokens: PunctuationToken[]) {
  let result = ''

  for (const { word, entity } of tokens) {
    if (!word) continue

    const isContinuation = word.startsWith('##')
    const piece = isContinuation ? word.slice(2) : word
    const formatted = punctuateWordpiece(piece, entity)

    if (!isContinuation && result.length > 0 && result.at(-1) !== '-') {
      result += ' '
    }

    result += formatted
  }

  return result.trim()
}

function splitToSegments(words: string[]) {
  const segments: Array<{ words: string[]; startWord: number }> = []
  let index = 0

  while (index < words.length) {
    const slice = words.slice(index, index + SEGMENT_WORDS + SEGMENT_OVERLAP)
    if (slice.length === 0) break
    segments.push({ words: slice, startWord: index })
    index += SEGMENT_WORDS
  }

  return segments
}

export function basicPunctuation(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  if (/[.!?,;:]$/.test(capitalized)) return capitalized
  return `${capitalized}.`
}

async function loadClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers')
      env.useBrowserCache = true
      return pipeline('token-classification', PUNCTUATION_MODEL_ID, {
        dtype: 'q8',
      })
    })()
  }

  return classifierPromise
}

export async function preloadPunctuationModel() {
  await loadClassifier()
}

export async function restorePunctuation(text: string) {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return ''

  const words = normalized.split(' ')
  if (words.length === 1) {
    return basicPunctuation(words[0] ?? '')
  }

  try {
    const classifier = await loadClassifier()
    const segments = splitToSegments(words)
    let result = ''

    for (const segment of segments) {
      const tokens = (await classifier(segment.words.join(' '), {
        ignore_labels: [],
      })) as PunctuationToken[]

      const segmentText = tokensToPunctuatedText(
        tokens.filter((token) => token.word && token.word !== ''),
      )

      if (!segmentText) continue

      if (result) {
        result = `${result.trimEnd()} ${segmentText}`
      } else {
        result = segmentText
      }
    }

    return result.trim() || basicPunctuation(normalized)
  } catch {
    return basicPunctuation(normalized)
  }
}

export function resetPunctuationModel() {
  classifierPromise = null
}
