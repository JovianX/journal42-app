export function mergeTranscripts(previous: string, next: string) {
  const left = previous.trim()
  const right = next.trim()
  if (!left) return right ? `${right} ` : ''
  if (!right) return left.endsWith(' ') ? left : `${left} `

  const leftWords = left.split(/\s+/)
  const rightWords = right.split(/\s+/)
  const maxOverlap = Math.min(leftWords.length, rightWords.length, 6)

  for (let size = maxOverlap; size > 0; size -= 1) {
    const leftTail = leftWords.slice(-size).join(' ').toLowerCase()
    const rightHead = rightWords.slice(0, size).join(' ').toLowerCase()
    if (leftTail === rightHead) {
      const merged = [...leftWords, ...rightWords.slice(size)].join(' ')
      return `${merged} `
    }
  }

  return `${left} ${right} `
}
