import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError } from '@/lib/api'
import { setAdminToken } from '@/lib/auth'
import { useAdminToken } from '@/lib/useAdminToken'
import { Wordmark } from '@/components/Wordmark'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CodeField } from '@/components/CodeField'

function decodeExpiryMs(token: string): number | null {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot).replace(/-/g, '+').replace(/_/g, '/')
  const padded = body + '='.repeat((4 - (body.length % 4)) % 4)
  try {
    const payload: unknown = JSON.parse(atob(padded))
    const exp = (payload as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export function PinGate({ children }: { children: ReactNode }) {
  const token = useAdminToken()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hadToken = useRef(false)
  const expiresAt = useRef<number | null>(null)
  useEffect(() => {
    if (token) {
      hadToken.current = true
      expiresAt.current = decodeExpiryMs(token)
    }
  }, [token])

  if (token) return <>{children}</>

  const expired = hadToken.current && expiresAt.current !== null && Date.now() >= expiresAt.current

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ token: string }>('/api/auth/admin', { method: 'POST', body: { pin } })
      setAdminToken(r.token)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form onSubmit={submit} className="grid w-full max-w-[360px] gap-4 rounded-lg border border-gray-7 bg-gray-2 p-4">
        <div className="grid justify-items-start gap-2">
          <img src="/easton-logo.png" alt="Easton Training Center" width={40} height={40} className="size-10 rounded-full" />
          <Wordmark />
          <h1 className="t6 text-gray-12">Admin</h1>
        </div>
        {expired && <p className="t2 text-gray-11">Your session expired. Enter the PIN to continue.</p>}
        <div className="grid gap-1.5">
          <Label htmlFor="pin">PIN</Label>
          <CodeField id="pin" length={6} aria-label="PIN" value={pin} onValueChange={setPin} autoFocus />
        </div>
        {error && (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={busy || pin.length !== 6}>Continue</Button>
      </form>
    </main>
  )
}
