import * as ort from 'onnxruntime-web'

const SILERO_MODEL_URL =
  'https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model_int8.onnx'
const CHUNK_SAMPLES = 512
const SAMPLE_RATE = 16_000
const STATE_SHAPE = 2 * 1 * 128

let sharedSession: ort.InferenceSession | null = null
let sharedLoad: Promise<ort.InferenceSession> | null = null

export async function loadSileroVadSession() {
  if (sharedSession) return sharedSession
  if (sharedLoad) return sharedLoad

  sharedLoad = ort.InferenceSession.create(SILERO_MODEL_URL, {
    executionProviders: ['wasm'],
  }).then((session) => {
    sharedSession = session
    return session
  })

  return sharedLoad
}

export function resetSileroVadSession() {
  sharedSession = null
  sharedLoad = null
}

export class SileroVadProcessor {
  private session: ort.InferenceSession
  private state = new Float32Array(STATE_SHAPE)
  private readonly srTensor = new ort.Tensor(
    'int64',
    new BigInt64Array([BigInt(SAMPLE_RATE)]),
    [1],
  )

  private constructor(session: ort.InferenceSession) {
    this.session = session
  }

  static async create() {
    const session = await loadSileroVadSession()
    return new SileroVadProcessor(session)
  }

  reset() {
    this.state.fill(0)
  }

  async processChunk(chunk512: Float32Array): Promise<number> {
    if (chunk512.length !== CHUNK_SAMPLES) {
      throw new Error(`Silero VAD expects ${CHUNK_SAMPLES} samples per chunk.`)
    }

    const input = new ort.Tensor('float32', chunk512, [1, CHUNK_SAMPLES])
    const state = new ort.Tensor('float32', this.state, [2, 1, 128])
    const outputs = await this.session.run({
      input,
      state,
      sr: this.srTensor,
    })

    const probability = outputs.output?.data
    const nextState = outputs.stateN?.data
    if (!(probability instanceof Float32Array) || probability.length === 0) {
      return 0
    }
    if (nextState instanceof Float32Array) {
      this.state.set(nextState)
    }

    return probability[0] ?? 0
  }
}

export const SILERO_CHUNK_SAMPLES = CHUNK_SAMPLES
export const SILERO_SAMPLE_RATE = SAMPLE_RATE
