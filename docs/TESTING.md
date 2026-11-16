# Testing

336 automated tests across four suites, all run in CI on every push.

| Suite | Tool | Tests | Command |
|---|---|---|---|
| Backend unit | Jest + ts-jest | 168 in 21 files | `npm --prefix backend test` |
| API end-to-end | Jest + Supertest + in-memory MongoDB replica set | 83 in 8 files | `npm run test:e2e` |
| Frontend | Jest + React Testing Library (jsdom) | 68 in 16 files | `npm --prefix frontend test` |
| Risk engine | JUnit 5 + AssertJ + MockMvc | 17 in 2 classes | `npm run test:java` |

## The test pyramid here

- **Unit tests** cover pure logic where mistakes are expensive: money
  arithmetic and rupee parsing, Luhn and account number generation, AES-GCM,
  TOTP, the ISO 8583 codec (bitmaps, LLVAR, framing, PIN block known answer,
  MAC), audit hash chain, risk rules and score bands, payment rail fees, the
  transaction state machine, journal rules (every entry balances), the pain.001
  parser (control totals, XXE), the circuit breaker (with an injected clock).
- **End-to-end tests** boot the real NestJS application (same configuration as
  production) against a throwaway MongoDB replica set and exercise it over HTTP.
  Each test file gets its own database. They are the main safety net: they
  cover **87% of statements and 90% of lines** of the API, the card switch and
  the shared library (`npm --prefix backend run test:e2e:cov`).
- **Frontend tests** cover forms and validation, formatting helpers, role-based
  navigation, the card controls and their meters, the message inspector,
  dialogs, the statement export (print tab opened during the click, popup
  blocker fallback) and the landing page's buttons for visitors, signed-in
  users and a session still being restored.
- **Java tests** run the rules directly and through the full Spring context
  (validation errors, API key filter, actuator health).

## What the end-to-end suites prove

| File | Highlights |
|---|---|
| `health.e2e-spec.ts` | Liveness, readiness, request IDs, error envelope |
| `auth.e2e-spec.ts` | Registration validation, lockout, MFA, refresh rotation and reuse detection, session revocation, CSRF header |
| `banking.e2e-spec.ts` | Transfers on every rail, OTP binding, idempotent replay, concurrent debits cannot overdraw, cooling period, approvals, NEFT settlement and return, statements and CSV |
| `staff.e2e-spec.ts` | Cash counter with approval thresholds and holds, idempotent cash slips, four-eyes rule, KYC review, masking for tellers, disabling a user, staff creation |
| `cards.e2e-spec.ts` | Card issue rules, OTP-gated reveal, weak PINs, the full ISO 8583 chain over mutual TLS, PIN lock after three tries, daily limits, reversal, controls, hotlist, forged MAC (63), client without a certificate |
| `integrations.e2e-spec.ts` | WSDL, WS-Security digest, replayed nonce, stale timestamp, partner scoping, a node-soap client generated from the WSDL, mini statement `Count`, XML statement and XSLT, markup in narrations escaped and the printable page's CSP, pain.001 preview, payee checks, OTP and atomic payment, duplicate file, control totals, XXE, forex fallback |
| `ledger.e2e-spec.ts` | Trial balance balances, reconciliation, a balance changed without a transaction is detected, exactly-once posting |
| `risk-engine.e2e-spec.ts` | Contract with a stand-in Java engine: API key, fallback with the same verdict, circuit opens and fails fast, recovery after the cooldown, malformed answers |

## Manual verification

Every screen was also exercised in a browser (customer, teller, manager and
administrator), including responsive layouts at 375 px (phone), 768 px
(tablet) and desktop, and the end-to-end demos: card simulator, audit tamper
detection, bulk payment, ledger reconciliation and the Java engine scoring a
real transfer. The printable statement was checked in Chromium (its policy
blocks an injected script and an external image), and the SOAP service with a
real WSDL client (`npm run soap -- security`). That client run found a bug the
hand-written envelopes had missed: `Count` arrived as a number and was
ignored. It is now fixed and covered by a test.

The Docker Compose stack was run end to end as well: sign-in through nginx, an
ATM withdrawal from the host whose debit alert reached the dashboard over a
WebSocket, the SOAP client, and the API calling the Java engine with its key
(details in DEPLOYMENT.md).

## Running everything

```bash
npm run lint && npm run typecheck
npm test
npm run test:e2e
npm run test:java
npm run build
```

The first end-to-end run downloads a MongoDB binary (cached afterwards). Set
`E2E_DEBUG=1` to see server-side errors while debugging a failing test.
