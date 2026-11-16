# Security

Banking software is judged first on how it fails. This page lists the controls
in Vinay Bank, where they live in the code, and what a real deployment would
add.

## OWASP Top 10 (2021) mapping

| Risk | Controls in Vinay Bank |
|---|---|
| A01 Broken access control | Global `JwtAuthGuard` + `RolesGuard` (opt-out only with `@Public()`); ownership checks in every service; need-to-know masking (tellers see masked mobile numbers, customers see only a risk level); maker-checker enforced on the server (`MAKER_CHECKER_VIOLATION`) |
| A02 Cryptographic failures | AES-256-GCM field encryption with AAD; HMAC blind indexes; RS256 tokens; bcrypt; TLS 1.2+ with mutual authentication on the card network; secrets generated per installation |
| A03 Injection | DTO validation with whitelisting; `MongoSanitizePipe` strips `$`/`.` keys; Mongoose `strictQuery`; regexes built only from escaped input; parameterised SQL through TypeORM; CSV formula-injection guard; XML DOCTYPE refused (XXE) |
| A04 Insecure design | Two-step transfers (signed quote, then OTP-bound execution); idempotency keys; daily limits; payee cooling period; risk scoring with step-up and review; hash-chained audit log |
| A05 Security misconfiguration | Joi-validated configuration (the API will not start misconfigured); Helmet headers; CORS allow-list; stack traces never returned; demo features behind `DEMO_MODE` |
| A06 Vulnerable components | Current major versions; lockfiles committed; `npm audit` of production dependencies gates CI (see [Dependency audit](#dependency-audit)); CI runs lint, type-check and all tests on every push |
| A07 Identification and authentication failures | Lockout after 5 failures (atomic counter), constant-time comparison with a dummy hash for unknown users, TOTP MFA with replay protection and recovery codes, refresh-token rotation with reuse detection |
| A08 Software and data integrity failures | Audit hash chain with a streaming verifier; MACs on ISO 8583 messages; Maven distribution pinned by SHA-256; HMAC-signed transfer quotes |
| A09 Logging and monitoring failures | Structured pino logs with request IDs and redaction of credentials; audit records for sign-ins, failures, money movement, staff actions, card decisions and SOAP authentication failures |
| A10 Server-side request forgery | Outbound calls only to configured base URLs (IFSC directory, ECB rates, risk engine) with timeouts; user input is never used as a URL |

## Authentication

- **Passwords**: bcrypt cost 12 (`BCRYPT_ROUNDS`), length and complexity policy,
  breach-resistant lockout (5 attempts, 15 minutes). Unknown e-mail addresses
  still run a bcrypt comparison against a dummy hash, so response time does not
  reveal which accounts exist.
- **Access tokens**: JWT signed with RS256 (`jose`), 15-minute lifetime,
  algorithm pinned, issuer and audience checked, public keys at `/auth/jwks`.
  The browser keeps the token in memory only, never in `localStorage`.
- **Refresh tokens**: 256-bit random secrets, stored only as SHA-256 hashes, sent
  in an `httpOnly`, `SameSite=Strict`, path-scoped cookie (`Secure` in
  production). Every refresh rotates the token; presenting an old token again
  revokes the session and records `AUTH_TOKEN_REUSE_DETECTED`. A 30-second grace
  window lets two tabs refresh at the same moment.
- **CSRF**: the cookie endpoints require `X-Requested-With: XMLHttpRequest`,
  which a cross-site form or image cannot send, on top of `SameSite=Strict`.
- **MFA**: TOTP (RFC 6238); each time step is accepted once (replay protection);
  eight single-use recovery codes stored hashed.
- **Sessions**: users see their devices and can sign out one or all; disabling a
  user signs them out everywhere at once.

## Money movement

- Amounts are integer paise end to end.
- Debits are conditional atomic updates (`$expr: ledgerBalance - holdAmount >= amount`)
  inside MongoDB transactions, so two parallel transfers cannot overdraw an account.
- Transfers are two steps: the quote is HMAC-signed (it cannot be altered) and
  the OTP is bound to the quote's content, so an OTP for Rs 500 cannot approve
  Rs 50,000.
- Every money-moving POST takes an `Idempotency-Key`; retries return the
  original result instead of paying twice.
- Limits: daily transfer limits (lower until KYC is verified), a 24-hour cooling
  period for new payees, card limits per channel reserved atomically.
- Maker-checker: high-value transfers, large cash transactions and account
  opening need a second, senior person; the maker can never approve their own
  request, and only one decision can win a race.
- Fraud scoring: Java rule engine (Spring Boot) with an identical in-process
  fallback; outcomes ALLOW, STEP_UP (OTP), REVIEW (hold for a manager), BLOCK.

## Data protection

- **Field encryption**: PAN (tax ID), MFA secrets and card numbers are encrypted
  with AES-256-GCM. The record context is bound as additional authenticated
  data, so a ciphertext copied to another record fails to decrypt. Each
  ciphertext carries a key ID; `DATA_ENCRYPTION_KEY_PREVIOUS` allows rotation.
- **Blind indexes**: HMAC-SHA256 of normalised values lets the API find a card or
  detect a duplicate PAN without decrypting anything.
- **Masking**: account numbers, mobile numbers, e-mail addresses and card numbers
  are masked in views, logs and notifications.
- **Audit trail**: every record stores the SHA-256 hash of the previous one.
  `GET /audit/verify` recomputes the chain (streaming over a cursor, constant
  memory) and names the first altered record. Try `npm run demo:tamper`.

## Cards and the ISO 8583 network

- The card number is encrypted and indexed by a blind index; the CVV is derived
  on demand from a card verification key and never stored; the PIN is never
  stored, only a keyed verification value (HMAC with the PIN verification key).
- Three wrong PINs lock PIN use until a new PIN is set (with an OTP). Trivial
  PINs (1111, 1234, 9876 and similar) are refused.
- Full card details are shown only after an OTP, for one minute, with
  `Cache-Control: no-store`, and each reveal is audited.
- PINs travel only inside ISO 9564 format 0 PIN blocks encrypted under triple-DES
  zone PIN keys. The switch translates the block from the acquirer zone key to
  the issuer zone key, as a hardware security module would; the clear block
  exists only inside that function and is wiped.
- Every message carries a MAC (HMAC-SHA256, 8 bytes, field 64 or 128); a bad MAC
  is answered with response code 63 without reaching the issuer.
- All card network links use TLS 1.2+ with client certificates issued by a
  private CA (mutual TLS): the ATM/POS link to the switch and the switch's link
  to the issuer. Unknown clients are rejected during the handshake.
- Logs and the message inspector show the card number as first six and last
  four digits only; the PIN block and expiry date are hidden.

## Integrations

- **SOAP**: WS-Security UsernameToken with PasswordDigest (nonce and timestamp,
  5-minute freshness, nonce replay rejected); the partner credential is bound to
  one customer's accounts; failed authentication is audited.
- **XML**: DOCTYPE and ENTITY declarations are refused before parsing; size is
  capped; ISO 20022 control totals are checked.
- **Printable statement**: narrations can contain text typed by someone else
  (a sender's remark), so every value goes through `xsl:value-of` and is
  escaped (tested with an `<img onerror>` payload). The web app shows the page
  from a `blob:` URL, where the API's HTTP headers do not apply, so the page
  carries its own Content-Security-Policy (no scripts, nothing external) and is
  opened without a handle back to the app window.
- **Risk engine**: shared API key compared in constant time; 800 ms timeout;
  circuit breaker; responses are validated before use.
- **Public APIs** (IFSC directory, exchange rates): timeouts, caching and offline
  fallbacks.

## Secrets

`npm run setup` generates every secret per installation (`backend/.env`,
`backend/.secrets`): encryption and HMAC keys, the JWT key pair, zone PIN keys,
MAC/PVK/CVK keys, the SOAP password, the risk engine key and the TLS CA. Nothing
secret is committed; `.env.example` holds only placeholders.

## Dependency audit

```bash
npm --prefix backend audit --omit=dev    # what ships: 0 vulnerabilities
npm --prefix frontend audit --omit=dev   # what ships: 0 vulnerabilities
```

- **Production dependencies: no known vulnerabilities.** TypeORM 0.3.31 (the
  latest 0.3 release) still depends on glob 10, which carries moderate
  advisories for glob and minimatch. An `overrides` entry in
  `backend/package.json` gives TypeORM the patched glob 14 instead. TypeORM
  only calls glob when entities are given as file patterns; Vinay Bank passes
  entity classes, and the ledger tests prove the override changes nothing.
- **Development tooling: moderate and low findings, accepted.** They come from
  Jest, typescript-eslint and the Nest CLI (glob, minimatch, and deepmerge
  in `fork-ts-checker-webpack-plugin`; deepmerge has no fixed release yet).
  These packages run only on developer machines and in CI, on our own source
  files; they never see user input and are not installed in production images
  (`npm ci --omit=dev`). npm's suggested `--force` fix would downgrade Jest
  to version 25, which is worse than the advisory.
- CI fails if a production dependency has a high or critical advisory. In a
  bank this would be backed by a software composition analysis tool with an
  SBOM (for example OWASP Dependency-Track) and a written exception process.

## What production would add

- Keys in a KMS or HSM (the card keys in a payment HSM), not in files.
- A three-node MongoDB replica set with backups and point-in-time recovery; the
  ledger on Oracle with Data Guard.
- A real SMS gateway (DLT-registered templates) and `DEMO_MODE=false`.
- WebAuthn passkeys and device binding for customers; SSO for staff.
- SAST/DAST and dependency scanning in CI, regular penetration tests, a WAF.
- Formal compliance work: RBI cyber security framework, PCI DSS for card data.
