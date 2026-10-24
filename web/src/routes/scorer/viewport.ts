import { useEffect, useState } from 'react'
import { SHORTEST_VIEWPORT } from './budget'

export const MIN_SCORER_WIDTH = 900

export function fitsScorer(width: number, height: number): boolean {
  return width >= MIN_SCORER_WIDTH && width >= height
}

export function useFitsScorer(): boolean {
  const [fits, setFits] = useState(() => typeof window === 'undefined' || fitsScorer(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const read = () => setFits(fitsScorer(window.innerWidth, window.innerHeight))
    read()
    window.addEventListener('resize', read)
    window.addEventListener('orientationchange', read)
    return () => {
      window.removeEventListener('resize', read)
      window.removeEventListener('orientationchange', read)
    }
  }, [])
  return fits
}

export function viewportHeight(): number {
  return window.innerHeight
}

export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === 'undefined' ? SHORTEST_VIEWPORT : viewportHeight())
  useEffect(() => {
    const read = () => setHeight(viewportHeight())
    read()
    window.addEventListener('resize', read)
    window.addEventListener('orientationchange', read)
    return () => {
      window.removeEventListener('resize', read)
      window.removeEventListener('orientationchange', read)
    }
  }, [])
  return height
}
