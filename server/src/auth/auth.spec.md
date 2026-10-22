# Auth
The admin PIN, the mat code, the signed tokens and the per-IP rate limit.

## invariants
- admin only: An admin route rejects a request without a valid admin token.
  over: a bare request, a mat token and an admin token on an admin route, and a mat token and an admin token on a mat route for its own mat and for another mat
  via: an admin route rejects a request without a valid admin token
  because: requireAdmin answers 401 without a verified bearer and 403 for a mat token, and requireMatOrAdmin lets a mat token through only for its own mat, so a tablet can never reach a setup write
  crossing: internet -> admin
  entrances: none
  refuted: removed the 403 role check from requireAdmin -> the test an admin route rejects a request without a valid admin token went red (2026-10-22)
  kinds: credential
  checklist: capability-authorization declared as admin only
  checklist: revalidated-permission dismissed: no work is deferred, every request verifies its bearer again, and a mat route also rechecks the bind epoch of the mat
  checklist: message-authenticity declared as signed tokens
  checklist: encrypted-storage dismissed: the server never stores a token; the client holds it
  checklist: key-rotation-compatibility dismissed: the HMAC secret is generated once and kept in the settings table, and nothing encrypted is retained
  checklist: separation-of-duties dismissed: one admin role holds every setup action and no approval policy exists
- signed tokens: A token is signed and expires.
  over: a round trip, a tampered signature, a wrong secret, a value with no signature, a mat token before and after its expiry, and a mat token minted before the epoch existed
  via: a token is signed and expires
  because: verifyToken compares the HMAC SHA-256 signature in constant time and refuses a payload past its exp, so a forged or stale token opens nothing
  crossing: internet -> admin
  entrances: none
  refuted: removed the expiry check from verifyToken -> the test a token is signed and expires went red (2026-10-22)
  kinds: credential
  checklist: capability-authorization declared as admin only
  checklist: revalidated-permission dismissed: a token lives 24 hours and every request verifies it again
  checklist: message-authenticity declared as signed tokens
  checklist: encrypted-storage dismissed: the server never stores a token; the client holds it
  checklist: key-rotation-compatibility dismissed: one HMAC secret per database, and nothing encrypted is retained
  checklist: separation-of-duties dismissed: no approval policy exists on a token
- rate limit: A PIN or mat code check is rate limited per IP.
  over: ten PIN failures then an eleventh attempt, twenty bind failures then the next attempt, fifty attempts with no recorded failure, a window older than one hour, one key in two scopes, and two keys in one scope
  via: a PIN or mat code check is rate limited per IP
  because: checkLimit reads the failure count per scope and key from the database and refuses past ten PIN or twenty bind failures in one hour, because a six digit PIN falls to a guess loop and Vercel functions share no memory
  refuted: checkLimit ignores the count and always allows -> the test a PIN or mat code check is rate limited per IP went red (2026-10-22)
  kinds: budget
  checklist: bounded-admission dismissed: the limit counts failures in a window, not active work
  checklist: fair-admission dismissed: no queue exists; a refused attempt gets a retry time and ends
  checklist: rate-budget declared as rate limit
  checklist: memory-budget dismissed: the count lives in one database row per scope and key
  checklist: execution-budget dismissed: a check is one select and runs no steps to count
  checklist: circuit-breaker-policy dismissed: no dependency is called through a breaker
- bearer through the middleware: A bearer is verified only by the auth middleware.
  protects: verifyToken
  chokepoint: attachAuth
  from: anywhere
  because: attachAuth is the one place a request's bearer is read and verified, so every route reads the same verified payload or null
  crossing: internet -> admin
  kinds: credential
  checklist: capability-authorization declared as admin only
  checklist: revalidated-permission dismissed: the middleware verifies the bearer on every request
  checklist: message-authenticity declared as signed tokens
  checklist: encrypted-storage dismissed: nothing is persisted at this chokepoint
  checklist: key-rotation-compatibility dismissed: nothing encrypted is retained
  checklist: separation-of-duties dismissed: no approval policy exists here
