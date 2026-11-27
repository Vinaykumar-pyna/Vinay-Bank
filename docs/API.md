# API reference

Interactive documentation (OpenAPI 3, generated from the code with the NestJS
Swagger plugin): **http://localhost:4000/api/docs**. This page explains the
conventions and lists every interface.

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` (URI versioning; a future `/api/v2` can coexist) |
| Format | JSON (UTF-8). Exceptions: CSV/XML/HTML statements, SOAP, ISO 8583 |
| Money | Integer **paise** (`150050` = Rs 1,500.50). Never floating point |
| Dates | ISO 8601 UTC strings; the UI shows India time |
| Authentication | `Authorization: Bearer <access token>` (RS256 JWT, 15 minutes) |
| Session refresh | `POST /auth/refresh` with the `vb_refresh` httpOnly cookie and `X-Requested-With: XMLHttpRequest` |
| Authorization | Role-based: `CUSTOMER`, `TELLER`, `MANAGER`, `ADMIN`; ownership checks in services |
| Validation | Unknown properties are rejected; field errors are listed in `error.details` |
| Idempotency | `Idempotency-Key: <uuid>` is required on money-moving POSTs (transfers, cash, bulk); a retry returns the original result with `Idempotent-Replayed: true` |
| Rate limits | Global per-IP limit; stricter limits on sign-in, transfer execution and the card simulator (HTTP 429) |
| Tracing | Every response has `X-Request-Id`; errors include `requestId` |

Success envelope:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 57, "totalPages": 3, "hasNext": true, "hasPrev": false } }
```

Error envelope:

```json
{
  "success": false,
  "statusCode": 422,
  "error": { "code": "INSUFFICIENT_FUNDS", "message": "Insufficient balance", "details": null },
  "path": "/api/v1/transfers",
  "timestamp": "2026-11-14T06:30:00.000Z",
  "requestId": "6f1c..."
}
```

Error codes are stable strings (`VALIDATION_FAILED`, `INVALID_CREDENTIALS`,
`ACCOUNT_LOCKED`, `MFA_REQUIRED`, `SESSION_REVOKED`, `INSUFFICIENT_FUNDS`,
`LIMIT_EXCEEDED`, `INVALID_OTP`, `IDEMPOTENCY_CONFLICT`, `RISK_BLOCKED`,
`MAKER_CHECKER_VIOLATION`, `KYC_REQUIRED`, ...): clients branch on `code`,
never on the message text.

## REST endpoints (78)

### Authentication and profile

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Customer sign-up (KYC pending, savings account opened) |
| POST | `/auth/login` | public | Password sign-in; returns `mfaRequired` when MFA is on |
| POST | `/auth/login/mfa` | public | Second step with an authenticator code or recovery code |
| POST | `/auth/refresh` | cookie | Rotate the refresh token, issue a new access token |
| POST | `/auth/logout` | cookie | Revoke the session |
| GET | `/auth/jwks` | public | Public key set for verifying access tokens |
| GET | `/auth/me` | any | Current profile |
| POST | `/auth/password` | any | Change password (signs out other sessions) |
| GET, DELETE, POST | `/auth/sessions`, `/auth/sessions/:id`, `/auth/sessions/revoke-others` | any | Device sessions |
| POST | `/auth/mfa/setup`, `/auth/mfa/enable`, `/auth/mfa/disable` | any | TOTP two-step sign-in |

### Accounts, payees and transfers

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/accounts`, `/accounts/overview`, `/accounts/branches` | customer | Accounts, dashboard data, branch list |
| POST | `/accounts` | customer | Request a new account (maker-checker approval) |
| GET, PATCH | `/accounts/:id` | owner / staff | Details; nickname and daily limit |
| GET | `/accounts/:id/statement` (`.csv`, `.xml`, `.html`) | owner / staff | Statement as JSON, CSV, XML or XSLT-rendered HTML |
| POST | `/accounts/:id/status` | manager, admin | Freeze, unfreeze or close |
| GET, POST, DELETE | `/beneficiaries`, `/beneficiaries/:id` | customer | Payees (24-hour cooling period) |
| GET | `/banks` | any | Banks payees can be added at (Vinay Bank, Bank of Baroda, SBI, HDFC and others): IFSC bank code, name, example IFSC |
| GET | `/ifsc/:code` | any | Bank branch lookup (live directory, cached, offline fallback that names the bank from the same list) |
| GET | `/transfers/rails` | customer | IMPS, NEFT, RTGS with fees and timings |
| POST | `/transfers/quote` | customer | Step 1: fee, rail, risk score; HMAC-signed quote + OTP |
| POST | `/transfers` | customer | Step 2: execute (OTP, Idempotency-Key, one ACID transaction) |
| GET | `/transactions`, `/transactions/:id` | customer / staff | History; staff see everything with risk filters |
| POST | `/transactions/settlement/run` | manager, admin | Run the NEFT batch now |
| GET | `/forex/rates` | any | Reference exchange rates |

### Cards and the simulator

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET, POST | `/cards` | customer | List cards; issue a virtual RuPay debit card |
| POST | `/cards/:id/otp` | customer | OTP to reveal details or set the PIN |
| POST | `/cards/:id/reveal` | customer | Full number, expiry, CVV (OTP, `Cache-Control: no-store`) |
| POST | `/cards/:id/pin` | customer | Set or change the PIN (OTP; weak PINs refused) |
| PATCH | `/cards/:id/settings` | customer | Channel controls and daily limits |
| POST | `/cards/:id/block`, `/unblock`, `/hotlist` | customer | Temporary block; permanent hotlist |
| GET | `/simulator/terminals`, `/simulator/demo-card` | public, demo mode | Simulator data |
| POST | `/simulator/card-network` | public, demo mode | Send an ISO 8583 message through the switch; returns the decoded exchange |

### Bulk payments, ledger and risk

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/bulk-payments`, `/bulk-payments/sample` | customer | Recent files; sample pain.001 for an account |
| POST | `/bulk-payments/preview` | customer | Parse and check a pain.001 file; OTP when valid |
| POST | `/bulk-payments` | customer | Pay the whole file atomically (OTP, Idempotency-Key) |
| GET | `/ledger/trial-balance`, `/ledger/reconciliation`, `/ledger/journal` | manager, admin | SQL ledger reports |
| POST | `/ledger/sync` | manager, admin | Post pending transactions now |
| GET | `/risk/engine` | manager, admin | Java engine health and circuit state |

### Staff portal, approvals, audit, notifications, health

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/staff/overview` | staff | KPIs (aggregation pipelines), risk alerts, audit events |
| GET | `/staff/customers`, `/staff/customers/:id` | staff | Search (tellers see masked mobiles); 360 view |
| POST | `/staff/customers/:id/kyc` | manager, admin | Verify or reject KYC |
| POST | `/staff/users/:id/status` | admin | Enable or disable a user (revokes sessions) |
| GET | `/staff/accounts/lookup` | staff | Account holder for the cash counter |
| POST | `/staff/cash/deposit`, `/staff/cash/withdrawal` | staff | Cash at the counter (approval above thresholds; idempotent) |
| GET, POST | `/staff/users` | admin | Staff directory; create staff |
| GET | `/approvals` | staff | Maker-checker queue |
| POST | `/approvals/:id/decision` | manager, admin | Approve or reject (never your own request) |
| GET | `/audit`, `/audit/verify` | manager, admin | Audit search; recompute the hash chain |
| GET, POST | `/notifications`, `/notifications/unread-count`, `/notifications/read-all`, `/notifications/:id/read` | any | In-app notifications |
| GET | `/health`, `/health/ready` | public | Liveness; readiness (MongoDB ping) |

## Other interfaces

| Interface | Address | Contract |
|---|---|---|
| WebSocket (Socket.IO) | `/socket.io`, JWT in the handshake | Server pushes `notification` events to the user's room |
| SOAP 1.1 | `POST /soap/banking`, WSDL at `?wsdl` | `GetAccountBalance`, `GetMiniStatement`, `ValidateIfsc`; WS-Security UsernameToken |
| ISO 8583 | TLS `:5800`, client certificate required | 0200/0210, 0420/0430, 0800/0810 (see ISO8583.md) |
| Issuer RPC | TLS `:4001` (NestJS TCP microservice) | `card.authorize`, `card.reverse` |
| Risk engine | `POST :8085/api/v1/risk/assess`, `X-Api-Key` | See `services/risk-engine/README.md` |

Ready-to-run requests for all of these are in [`/http`](../http).
