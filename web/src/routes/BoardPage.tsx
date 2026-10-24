import { useEffect } from 'react'
import { useParams } from 'react-router'
import { useSnapshot } from '@/lib/useSnapshot'
import { useWakeLock } from '@/lib/useWakeLock'
import { Board } from './board/Board'

export default function BoardPage() {
  const { eventId } = useParams()
  const { snapshot, connected, lastSuccessAt } = useSnapshot(eventId ? Number(eventId) : null)
  const { active, failed, request } = useWakeLock()

  useEffect(() => {
    if (active) return
    const ask = () => { void request() }
    ask()
    window.addEventListener('pointerdown', ask)
    window.addEventListener('keydown', ask)
    return () => {
      window.removeEventListener('pointerdown', ask)
      window.removeEventListener('keydown', ask)
    }
  }, [active, request])

  return (
    <Board
      snapshot={snapshot}
      connected={connected}
      lastSuccessAt={lastSuccessAt}
      screenMaySleep={failed && !active}
    />
  )
}
