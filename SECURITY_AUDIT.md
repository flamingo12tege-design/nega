# CAS Production Security Audit

## Current findings

### Critical
- Admin credentials in `src/routes/casadmin.tsx` are client-side demo credentials and are not real server authentication.
- Admin access is stored in `sessionStorage`; it can be removed or bypassed and provides no server-side authorization.
- User login and logout only update in-memory state in `src/lib/store.ts`; there is no real session, password verification, or account identity.
- Wallet balances, purchases, commissions, packages, and admin changes are stored only in browser memory and reset on reload.
- Critical balance and purchase mutations execute in the browser and cannot be trusted in production.
- `VITE_*` environment values are public in built browser JavaScript and must never contain passwords or secrets.

### Required hardening
- Use Supabase authentication and PostgreSQL database.
- Store passwords only with Supabase Auth; never in application state or environment variables.
- Require email or phone verification and MFA for administrators.
- Use short-lived access tokens plus secure server-managed refresh sessions.
- Add PostgreSQL Row Level Security for every table.
- Define admin-only server policies and never rely on a hidden route or frontend role check.
- Put balance changes, purchases, withdrawals, referral rewards, and package approval in database RPC functions or server-side functions.
- Use transactions, uniqueness constraints, idempotency keys, and ledger tables for every financial operation.
- Apply rate limits to login, OTP, withdrawal, recharge, and admin mutation endpoints.
- Validate all uploads and payment proof files; keep them in private storage with signed URLs.
- Add audit logs for every admin action and all balance changes.
- Add CSP, HSTS, X-Frame-Options or frame-ancestors, and secure cookie headers at deployment level.
- Add server-side input validation, output encoding, CORS allowlisting, CSRF protection, and request size limits.
- Add automated dependency scanning, secret scanning, backups, monitoring, and alerting.

## Recommended production stack

- Auth and database: Supabase Auth and PostgreSQL.
- Authorization: Supabase Row Level Security plus RPC functions for privileged operations.
- Storage: Supabase private storage buckets for KYC and payment proof.
- Payments: Verified CBE payment callbacks or an approved payment provider; never trust browser-side payment status.
- Sessions: Supabase access/refresh session tokens with MFA for admins.
- Deployment: Cloudflare/hosting TLS, CSP, HSTS, security headers, and environment secrets.

## Important limitation

The current app is a functional demo with mock/in-memory data. Its UI can look complete, but no frontend-only implementation can make the money, purchases, users, or admin actions secure against tampering. Backend policies and trusted server operations are mandatory before production use.
