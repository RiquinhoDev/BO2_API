# Startup Security Boundaries Design

## Goal

Close the remaining JWT/debug/upload and CORS hardening slices without contacting external systems or weakening compatibility outside the security boundary.

## Current Gaps

- `OLD_API_JWT_SECRET` is optional and old-API signing silently falls back to the application JWT secret.
- Student access verifies with `STUDENT_ACCESS_JWT_SECRET || JWT_SECRET` directly from `process.env`, allowing an application token to cross into the student-token authority when the dedicated secret is absent.
- `/api/curseduca/debug` is a deprecated 501 endpoint but is not protected by `localDebugOnly`.
- CORS always merges hard-coded production and localhost origins. Production starts without `ALLOWED_ORIGINS`, so it is not fail-closed configuration.
- `createApp` independently recreates implicit CORS defaults when no allowlist is injected.

## Selected Design

### Dedicated JWT authorities

`AppConfig` requires three strong secrets, each at least 32 characters: `JWT_SECRET`, `OLD_API_JWT_SECRET`, and `STUDENT_ACCESS_JWT_SECRET`. Configuration validation remains the first bootstrap action, before infrastructure loads.

`configureJwt` receives all three secrets. `signOldApiToken` uses only `oldApiJwtSecret`; it has no fallback. Add `verifyStudentAccessToken` using only `studentAccessJwtSecret`. `resolveStudentEmailFromToken` delegates verification to that central function and no longer imports `jsonwebtoken` or reads JWT environment variables.

`STUDENT_SUMMARY_TOKEN` remains outside this slice and therefore does not close the global OPS-01 configuration criterion.

### Debug boundary

Mount `debugCurseducaAPI` behind `localDebugOnly`. With debug disabled it returns 404 before the deprecated handler; with the explicit local flag it retains the existing 501 response.

The endpoint is not deleted in this block because the sibling Front checkout contains its generated contract snapshot and is currently dirty/ahead. Route deletion must be atomic with that contract regeneration in a later clean cross-repository block.

### Environment-aware CORS

`buildAllowedOrigins(value, nodeEnv)` has two modes:

- `production`: `ALLOWED_ORIGINS` is mandatory, must contain at least one valid HTTP(S) origin, and the result contains exactly the normalized configured origins.
- `development` and `test`: explicit configured origins are merged only with loopback development defaults.

Hard-coded production domains are removed from source. `createApp` without an injected allowlist uses an empty browser-origin list; requests without an `Origin` header remain allowed for server-to-server and webhook traffic.

`.env.example` labels the two dedicated JWT secrets and production CORS allowlist as mandatory, without embedding real credentials.

## Testing

Use strict RED/GREEN tests for:

- missing or short dedicated JWT secrets aborting before infrastructure;
- application, old-API, and student tokens being mutually separated;
- student email resolution using the central student authority;
- the real mounted CursEduca debug route returning 404 when disabled and 501 only when locally enabled;
- production rejecting absent/empty `ALLOWED_ORIGINS`;
- production returning only explicit normalized origins and excluding localhost;
- development/test preserving loopback defaults;
- `createApp` rejecting browser origins without an injected allowlist while allowing requests without `Origin`.

Focused suites run before the full offline gate. Jest uses `MONGOMS_RUNTIME_DOWNLOAD=false`; no API, ActiveCampaign, CursEduca, Guru, or real Mongo call is permitted.

## Documentation and Closure

After focused and full final-HEAD gates pass, mark the JWT/debug/upload and CORS criteria complete. Keep OPS-01 open because direct environment reads remain elsewhere. The mechanical workplan count moves from `86/104` to `88/104` (`84.6%`).

## Stop Conditions

- Stop if the actual old-API secret contract cannot be made explicit without a fallback.
- Stop if any test requires a real external service or production credential.
- Stop deployment handoff until the real environment provisions all mandatory secrets and the complete production origin list.
- Do not modify the dirty sibling Front checkout in this block.
