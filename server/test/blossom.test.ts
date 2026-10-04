import { describe, it, expect } from 'vitest'
import { maximumWeightMatching, type WeightedEdge } from '../src/matchmaker/blossom.js'

function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomGraph(rand: () => number, n: number, density: number, integer: boolean): WeightedEdge[] {
  const edges: WeightedEdge[] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (rand() >= density) continue
      const weight = integer ? 1 + Math.floor(rand() * 20) : Math.round((0.01 + rand() * 20) * 100) / 100
      edges.push(rand() < 0.5 ? { a, b, weight } : { a: b, b: a, weight })
    }
  }
  return edges
}

function bruteForceMaximum(n: number, edges: WeightedEdge[]): number {
  const adjacent = Array.from({ length: n }, () => Array.from({ length: n }, () => -1))
  for (const { a, b, weight } of edges) adjacent[a][b] = adjacent[b][a] = weight
  const best = (used: number): number => {
    let v = 0
    while (v < n && used & (1 << v)) v++
    if (v === n) return 0
    let result = best(used | (1 << v))
    for (let w = v + 1; w < n; w++) {
      if (used & (1 << w) || adjacent[v][w] < 0) continue
      result = Math.max(result, adjacent[v][w] + best(used | (1 << v) | (1 << w)))
    }
    return result
  }
  return best(0)
}

function matchingWeight(n: number, edges: WeightedEdge[], mate: number[]): number {
  const weights = new Map<string, number>()
  for (const { a, b, weight } of edges) weights.set(`${Math.min(a, b)}-${Math.max(a, b)}`, weight)
  expect(mate).toHaveLength(n)
  let total = 0
  mate.forEach((w, v) => {
    if (w === -1) return
    expect(mate[w]).toBe(v)
    if (v < w) {
      const weight = weights.get(`${v}-${w}`)
      expect(weight, `pair ${v}-${w} is not an input edge`).toBeDefined()
      total += weight as number
    }
  })
  return total
}

const REFERENCE_CASES: [number, number, number][][] = [
  [[1, 2, 8], [1, 3, 9], [2, 3, 10], [3, 4, 7]],
  [[1, 2, 8], [1, 3, 9], [2, 3, 10], [3, 4, 7], [1, 6, 5], [4, 5, 6]],
  [[1, 2, 9], [1, 3, 8], [2, 3, 10], [1, 4, 5], [4, 5, 4], [1, 6, 3]],
  [[1, 2, 9], [1, 3, 8], [2, 3, 10], [1, 4, 5], [4, 5, 3], [1, 6, 4]],
  [[1, 2, 9], [1, 3, 8], [2, 3, 10], [1, 4, 5], [4, 5, 3], [3, 6, 4]],
  [[1, 2, 9], [1, 3, 9], [2, 3, 10], [2, 4, 8], [3, 5, 8], [4, 5, 10], [5, 6, 6]],
  [[1, 2, 10], [1, 7, 10], [2, 3, 12], [3, 4, 20], [3, 5, 20], [4, 5, 25], [5, 6, 10], [6, 7, 10], [7, 8, 8]],
  [[1, 2, 8], [1, 3, 8], [2, 3, 10], [2, 4, 12], [3, 5, 12], [4, 5, 14], [4, 6, 12], [5, 7, 12], [6, 7, 14], [7, 8, 12]],
  [[1, 2, 23], [1, 5, 22], [1, 6, 15], [2, 3, 25], [3, 4, 22], [4, 5, 25], [4, 8, 14], [5, 7, 13]],
  [[1, 2, 19], [1, 3, 20], [1, 8, 8], [2, 3, 25], [2, 4, 18], [3, 5, 18], [4, 5, 13], [4, 7, 7], [5, 6, 7]],
  [[1, 2, 45], [1, 5, 45], [2, 3, 50], [3, 4, 45], [4, 5, 50], [1, 6, 30], [3, 9, 35], [4, 8, 35], [5, 7, 26], [9, 10, 5]],
  [[1, 2, 45], [1, 5, 45], [2, 3, 50], [3, 4, 45], [4, 5, 50], [1, 6, 30], [3, 9, 35], [4, 8, 26], [5, 7, 40], [9, 10, 5]],
  [[1, 2, 45], [1, 5, 45], [2, 3, 50], [3, 4, 45], [4, 5, 50], [1, 6, 30], [3, 9, 35], [4, 8, 28], [5, 7, 26], [9, 10, 5]],
  [[1, 2, 45], [1, 7, 45], [2, 3, 50], [3, 4, 45], [4, 5, 95], [4, 6, 94], [5, 6, 94], [6, 7, 50], [1, 8, 30], [3, 11, 35], [5, 9, 36], [7, 10, 26], [11, 12, 5]],
  [[1, 2, 40], [1, 3, 40], [2, 3, 60], [2, 4, 55], [3, 5, 55], [4, 5, 50], [1, 8, 15], [5, 7, 30], [7, 6, 10], [8, 10, 10], [4, 9, 30]],
]

describe('maximumWeightMatching', () => {
  it('equals the brute-force maximum on the reference blossom cases and 300 seeded random graphs', () => {
    const rand = prng(20261004)
    const cases = Array.from({ length: 300 }, (_, i) => {
      const n = 2 + Math.floor(rand() * 8)
      return { n, edges: randomGraph(rand, n, 0.2 + rand() * 0.8, i % 4 !== 3) }
    })
    for (const triples of REFERENCE_CASES) {
      const edges = triples.map(([a, b, weight]) => ({ a, b, weight }))
      cases.push({ n: 1 + Math.max(...edges.flatMap((e) => [e.a, e.b])), edges })
    }
    for (const { n, edges } of cases) {
      const mate = maximumWeightMatching(n, edges)
      expect(matchingWeight(n, edges, mate)).toBeCloseTo(bruteForceMaximum(n, edges), 9)
    }
  })

  it('is deterministic and solves the reference example', () => {
    const example: WeightedEdge[] = [
      { a: 0, b: 1, weight: 6 },
      { a: 0, b: 2, weight: 10 },
      { a: 1, b: 2, weight: 5 },
    ]
    expect(maximumWeightMatching(3, example)).toEqual([2, -1, 0])
    const rand = prng(7)
    const edges = randomGraph(rand, 40, 0.5, true)
    expect(maximumWeightMatching(40, edges)).toEqual(maximumWeightMatching(40, edges))
    expect(() => maximumWeightMatching(3, [{ a: 0, b: 3, weight: 1 }])).toThrow(RangeError)
    expect(() => maximumWeightMatching(3, [{ a: 0.5, b: 1, weight: 1 }])).toThrow(RangeError)
  })

  it('beats greedy by descending weight on a dense 120-vertex graph', () => {
    const n = 120
    const edges = randomGraph(prng(42), n, 0.7, false)
    const mate = maximumWeightMatching(n, edges)
    const taken = new Set<number>()
    let greedy = 0
    for (const { a, b, weight } of [...edges].sort((x, y) => y.weight - x.weight)) {
      if (taken.has(a) || taken.has(b)) continue
      taken.add(a).add(b)
      greedy += weight
    }
    expect(matchingWeight(n, edges, mate)).toBeGreaterThanOrEqual(greedy - 1e-9)
  })
})
