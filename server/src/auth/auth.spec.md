# Auth
The admin PIN, the mat code, the signed tokens and the per-IP rate limit.

## invariants
- an admin route rejects a request without a valid admin token
- a token is signed and expires
- a PIN or mat code check is rate limited per IP

## works when
- boundary "an admin route rejects a request without a valid admin token" at requireAdmin via guard "middleware"
- boundary "a token is signed and expires" at verifyToken via guard "tokens"
- boundary "a PIN or mat code check is rate limited per IP" at checkLimit via guard "checkLimit"
- passes test "POST /api/auth/admin"
- passes test "pin"

## why
`ADMIN_PIN` (six digits, env) gates every setup mutation server-side through HMAC tokens with
a 24 hour life. Each event gets a mat code so parents at the tables never see the admin PIN; a
tablet's token dies when another tablet takes the mat over (`bind_epoch`). Board and snapshot
routes are open. The rate limit is five failures per minute per IP, stored in the database
because Vercel functions share no memory. The client must not clear the admin token on any
401: a mistyped PIN on delete, certify or unlock once sent the desk back to the PIN gate.

## refutations
- an admin route rejects a request without a valid admin token: removed the 403 non-admin role check in requireAdmin -> RED, "1 failed | 1 passed" in middleware
- a token is signed and expires: removed the expiry check in verifyToken -> RED, "1 failed | 3 passed" in tokens
- a PIN or mat code check is rate limited per IP: checkLimit ignores the count and always allows -> RED, "5 failed | 1 passed" in checkLimit
