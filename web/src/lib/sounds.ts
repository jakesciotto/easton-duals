let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    return ctx
  } catch {
    return null
  }
}

function reducedAudio(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-audio: reduce)').matches
  } catch {
    return false
  }
}

export function unlockAudio(): void {
  const c = getCtx()
  if (c?.state === 'suspended') void c.resume()
}

function pluck(c: AudioContext, freq: number, start: number, attackS: number, decayS: number, peak = 0.3): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(c.destination)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + attackS)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attackS + decayS)
  osc.start(start)
  osc.stop(start + attackS + decayS + 0.02)
}

function sustain(c: AudioContext, freq: number, start: number, totalS: number, attackS: number, releaseS: number, peak = 0.3): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(c.destination)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + attackS)
  gain.gain.setValueAtTime(peak, start + totalS - releaseS)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + totalS)
  osc.start(start)
  osc.stop(start + totalS + 0.02)
}

export function playRegistered(): void {
  if (reducedAudio()) return
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  pluck(c, 880, t, 0.006, 0.024)
  pluck(c, 1320, t + 0.03, 0.006, 0.024)
}

export function playExpired(): void {
  if (reducedAudio()) return
  const c = getCtx()
  if (!c) return
  sustain(c, 220, c.currentTime, 0.8, 0.02, 0.12)
}

export function playRejected(): void {
  if (reducedAudio()) return
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  pluck(c, 160, t, 0.006, 0.04)
  pluck(c, 160, t + 0.12, 0.006, 0.04)
}
