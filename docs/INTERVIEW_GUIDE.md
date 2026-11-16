# Interview guide

How to present Vinay Bank for the **Officer-Developer, Full Stack (MERN)** role:
a pitch, a demo script, how every requirement in the job notification maps to
the code, and the questions you are likely to get, with answers.

## The pitch

**30 seconds.** "Vinay Bank is a full-stack digital banking platform I built with
MongoDB, NestJS, React and TypeScript. Customers open accounts, send money over
IMPS, NEFT and RTGS, manage RuPay debit cards and upload ISO 20022 bulk payment
files; branch staff work a maker-checker queue, a cash counter and a
tamper-evident audit trail. Around the core there is an ISO 8583 card switch
over mutual TLS, a Java Spring Boot fraud engine behind a circuit breaker, a
SOAP service with WS-Security, and a double-entry general ledger in SQL with
Oracle scripts. It has 336 automated tests and CI."

**Two minutes.** Add the architecture in one breath (modular NestJS monolith
for the core because transfers need ACID across accounts, postings, approvals
and audit; separate processes where banks really separate them: switch, risk
engine, ledger), then two things you are proud of: money can never be
double-spent or double-posted (conditional atomic debits in MongoDB
transactions, idempotency keys, an idempotent ledger projector that reconciles
to the paisa), and PINs never exist in clear outside a single function (ISO-0
PIN blocks, zone keys, translation at the switch, keyed verification).

## Demo script (12 to 15 minutes)

Start `npm run dev` before the interview and sign in once to warm up.

1. **Customer dashboard** (Priya): balances, cash-flow chart, spending, live
   exchange rates. Mention: React 19, Redux Toolkit with RTK Query (cache tags),
   Axios with silent token refresh, Bootstrap 5 + SCSS, responsive down to phones.
2. **Send money**: pick Rahul, Rs 1,234.50. Point out the amount in words, the
   OTP that arrives as a live notification (Socket.IO), the instant receipt.
   Then mention what you cannot see: a signed quote, an OTP bound to that quote,
   an Idempotency-Key, a conditional debit inside a MongoDB transaction, and the
   Java engine scoring the transfer.
3. **Cards**: show details behind an OTP (hidden again after a minute),
   switches for ATM/shops/online, limits with usage meters.
4. **ATM simulator** (`/simulator`): use the demo card, check the balance,
   withdraw Rs 2,000, then press "Cash not dispensed". Open the message
   inspector: 0200/0210, bitmap, field 52 hidden, hex dump, TLS 1.3. Explain
   PIN block, zone keys, MAC, mutual TLS. Optionally run
   `npm run atm -- balance --demo --pin 4826` in a terminal.
5. **Bulk payments**: download the sample pain.001, upload it, show the checks
   (XPath, control totals, payee bank lookup), approve with one OTP: all-or-nothing.
   For SOAP, run `npm run soap -- security` in a terminal: a client generated
   from the WSDL signs with PasswordDigest, then a replayed request, a wrong
   password and another customer's account are all refused.
6. **Staff portal** as the teller: cash deposit of Rs 3,00,000 goes to approval.
   Switch to the manager: approve it (and show that the maker cannot approve
   their own request).
7. **General ledger** (manager): trial balance balances, every customer account
   reconciles with MongoDB, journal entries with Dr/Cr lines.
8. **Audit trail**: "Verify integrity" (chain intact), run `npm run demo:tamper`,
   verify again: tampering detected at record N. Restore with
   `npm run demo:tamper:restore`.
9. **Resilience**: stop the `risk` process; transfers keep working, the
   dashboard says "Fallback rules"; restart it and the circuit closes again.
10. **Engineering**: Swagger at `/api/docs`, the WSDL at `/soap/banking?wsdl`,
    the CI workflow, and the test counts.

## Job notification requirements, mapped

| Requirement | Where it is in Vinay Bank |
|---|---|
| Node.js / NestJS banking applications on a NoSQL database | `backend/apps/api`: 20+ NestJS modules on MongoDB (replica set, multi-document transactions, aggregation pipelines, TTL and unique indexes) |
| Integrating outside APIs and microservices | IFSC directory and ECB exchange rates with caching and fallbacks; Java risk engine over HTTP with a circuit breaker; card switch as a separate NestJS app over a NestJS TCP microservice |
| Unit testing | 336 tests: Jest (backend, frontend), React Testing Library, Supertest e2e with an in-memory replica set, JUnit 5 + MockMvc |
| Front-end architecture | Feature folders, route-level code splitting, Redux Toolkit + RTK Query with cache invalidation tags, typed API layer, guards by role, design tokens in SCSS |
| Databases, performance | Indexes on every query path, `lean()` reads, aggregation pipelines for KPIs, single round-trip `$lookup`, streaming audit verification, compression, cached lookups, lazy-loaded pages |
| MongoDB, NestJS, React, TypeScript (MERN with NestJS) | The whole stack, TypeScript strict mode end to end |
| REST and JSON | 77 versioned endpoints, uniform envelopes and error codes, OpenAPI docs |
| OOAD and design patterns | Strategy, Registry, State machine, Observer, Circuit breaker, Adapter, Repository, DI (see ARCHITECTURE.md) |
| IDE | VS Code workspace: debug configurations (API, Jest, Chrome, Spring Boot), tasks, REST Client collections |
| NoSQL and relational / Oracle SQL | MongoDB for operations; double-entry ledger in SQL via TypeORM; Oracle DDL, PL/SQL package and analytic reports in `database/oracle` |
| Linux | systemd units with hardening, PM2 config, Linux deployment guide, Docker images |
| Cryptography | AES-256-GCM with AAD and key rotation, HMAC blind indexes, RS256 JWT, bcrypt, TOTP, SHA-256 hash chain, triple-DES PIN blocks, HMAC MACs, PKI with mutual TLS |
| JSON, SOAP, WSDL, XML, XSLT, XPath | SOAP 1.1 service with WSDL and WS-Security; XML statements and an XSLT 1.0 transform; ISO 20022 pain.001 parsed with namespaced XPath |
| npm and nginx | npm scripts orchestrating three packages (root, backend, frontend) with committed lockfiles; nginx edge config (TLS, headers, rate limits, WebSocket proxy) and the web container's nginx |
| Git, CI, Maven / Gradle | Phase-by-phase commit history; GitHub Actions (Node and Java jobs); Maven Wrapper with a checksum-pinned distribution |
| Core Java, Spring, the JVM | Java 21 records, enums, streams, Optional, virtual threads; Spring Boot 4 (Web MVC, Bean Validation, Actuator); JVM flags in Docker/systemd |
| CSS3, TypeScript, Redux, ESLint, Axios, Jest, Bootstrap | All used directly; ESLint with type-aware rules and the React Compiler rules |
| ISO 8583, TCP/IP, secure sockets | Own codec (bitmaps, LLVAR, framing), TLS server and client with client certificates, reconnect-safe stream decoding |

## Questions you will probably get

**Why NestJS rather than plain Express?** Structure that scales with a team:
modules with explicit boundaries, dependency injection (testable services),
declarative guards/pipes/interceptors for cross-cutting concerns, first-class
microservice transports. Express is still underneath (and used directly for
the SOAP router).

**How do you stop two transfers from overdrawing an account?** The debit is one
conditional update: match the account only if `ledgerBalance - holdAmount >=
amount`, then `$inc`. Two concurrent requests cannot both match. It runs inside
a MongoDB transaction with the postings and the transaction record, so either
everything is written or nothing is. A test fires parallel transfers and checks
the balance never goes negative.

**Why does MongoDB need a replica set here?** Multi-document ACID transactions
require one (even a single node). Development runs a single-node replica set;
production uses three nodes.

**What if the client times out and retries a transfer?** The Idempotency-Key is
stored with a unique index inside the same transaction as the money movement.
A retry returns the stored response with `Idempotent-Replayed: true`; the same
key with a different body is rejected.

**Why store money as integers?** Binary floating point cannot represent 0.1
exactly; rounding errors compound. Paise as integers are exact; formatting
happens only at the edges.

**How does sign-in stay secure if the access token leaks?** It lives 15 minutes
and only in memory. The refresh token is httpOnly (JavaScript cannot read it),
rotated on every use, stored only as a hash, and a replayed old token revokes
the session. RS256 lets other services verify tokens with the public key
without being able to mint them.

**Why RS256 instead of HS256?** Asymmetric: only the API holds the private key;
anyone (the switch, a future service) can verify with the published JWKS.

**What is maker-checker?** Four eyes: one person initiates, a different, more
senior person approves. Implemented as approval records with a handler registry
per type; the decision is a single conditional update, so two managers clicking
at once cannot both decide, and the maker can never approve their own request.

**Walk me through an ATM withdrawal.** (See ISO8583.md.) 0200 with the PIN
block encrypted under the acquirer zone key and a MAC, over mutual TLS. The
switch verifies the MAC, translates the PIN block to the issuer key and calls
the issuer over an internal mutual-TLS RPC. The issuer checks card status,
expiry, channel controls, the PIN (keyed verification value, three-try lock),
reserves the daily limit atomically and debits in one transaction. The switch
answers 0210 with code 00 and an auth code; if the issuer is down it answers 91.

**What is a bitmap?** A bit per data element telling the receiver which fields
are present; bit 1 announces a secondary bitmap for fields 65-128.

**Why can't you just store the PIN hashed?** Only 10,000 four-digit PINs exist:
any unkeyed hash is brute-forced instantly. Issuers keep a verification value
computed with a secret key held in an HSM. Vinay Bank does the same with an HMAC.

**What does mutual TLS add?** The server proves its identity to the client and
the client proves its identity to the server, with certificates from a private
CA. An attacker on the network can neither read the traffic nor connect.

**SOAP in 2026, really?** Banks and their corporate customers still integrate
over SOAP. The WSDL is a machine-readable contract; WS-Security puts
authentication inside the message. PasswordDigest with a nonce and timestamp
means the password never travels and a captured request cannot be replayed.

**What are XSLT and XPath used for?** XPath selects nodes in XML (the pain.001
parser reads amounts, account numbers, IFSC codes and control sums with
namespaced XPath). XSLT transforms XML into another format (the statement XML becomes a
printable HTML page).

**How do you protect against XXE?** Refuse DOCTYPE and ENTITY declarations before
parsing, cap the size, and use a parser that does not resolve external entities.

**Why a SQL ledger next to MongoDB?** Accounting wants constraints, joins and
aggregates: debit equals credit per entry, a trial balance with GROUP BY, a
reconciliation against the operational balances. MongoDB stays the system of
record for operations; the ledger is a projection that can be rebuilt.

**How is the ledger kept consistent with MongoDB?** An idempotent consumer:
each transaction is posted at most once per kind thanks to a unique key
(source_id, kind), and marked in MongoDB only after the SQL commit. If the
process dies in between, the next run hits the unique key and just sets the
marker. Reconciliation proves it: every account balance matches the sub-ledger.

**What would change with Oracle?** Only configuration (`LEDGER_DB_TYPE=oracle`)
plus the DDL in `database/oracle`; TypeORM entities use portable types. The
PL/SQL package enforces balance inside the database for other clients too.

**Explain the circuit breaker.** Closed: calls pass and failures are counted.
After three consecutive failures it opens: calls fail immediately for 30
seconds instead of waiting on timeouts. Then half-open: one trial call; success
closes it, failure reopens it. Meanwhile the same rules run in-process, so the
customer never notices.

**Why Java for the risk engine?** Realistic: banks run scoring on the JVM, and
it shows interoperability through a plain JSON contract. The rules use the
Strategy pattern: each is a Spring bean, so adding one means adding a class.

**What Java features did you use?** Records for immutable DTOs, enums with
behaviour and switch expressions, streams and Optional, text blocks in tests,
virtual threads for request handling, Bean Validation, constructor injection.

**How do you make the front end fast?** Route-level code splitting, RTK Query
caching and de-duplication, tag-based invalidation instead of refetching
everything, debounced search, server-side pagination, compressed responses,
immutable caching of hashed assets in nginx.

**How is state managed in React?** Server state in RTK Query (cache, loading,
errors); a small Redux slice for auth and UI preferences; local component state
for forms (React Hook Form + Zod). The access token is in memory only.

**How do you test?** A pyramid: unit tests for pure logic, end-to-end tests on
the real application with a real (in-memory) MongoDB replica set, component
tests in the browser environment, JUnit with MockMvc for Java. CI runs all of
it on every push.

**What would you improve next?** Keys in an HSM/KMS, a three-node replica set,
the Socket.IO Redis adapter for horizontal scaling, WebAuthn passkeys, contract
tests generated from the OpenAPI spec, load tests, observability with
OpenTelemetry traces across the API, the switch and the Java engine.

**What was the hardest bug?** Two good stories: (1) Mongoose stored
`ObjectId` references as plain strings because of a schema type subtlety; a
regression test now checks every reference type. (2) The Java service would not
start on this Windows machine: the JDK's NIO pipe uses a Unix-domain socket in
the temp folder, and the user name contains a space. Diagnosed with a
four-line probe program and fixed in the dev runner.

## Numbers to remember

| | |
|---|---|
| Automated tests | 336 (168 backend unit, 83 API e2e, 68 frontend, 17 JUnit) |
| E2E coverage | 87% of statements, 90% of lines (API, switch, shared lib) |
| REST endpoints | 77, plus SOAP (3 operations), ISO 8583 (3 message pairs), RPC (2), WebSocket |
| Runtime processes | 5: MongoDB, API, card switch, risk engine, web |
| Languages | TypeScript, Java, SQL/PL-SQL, XSLT, SCSS |
