# Vinay Bank risk engine (Java, Spring Boot)

A small fraud-scoring microservice. The core banking API (NestJS) asks it to
score every transfer before the money moves, and acts on the decision:

| Score | Level | Decision | What the API does |
|---|---|---|---|
| 0-29 | LOW | ALLOW | Proceeds |
| 30-59 | MEDIUM | STEP_UP | Asks for an OTP or authenticator code |
| 60-79 | HIGH | REVIEW | Holds the money for a branch manager (maker-checker) |
| 80-100 | CRITICAL | BLOCK | Refuses the transfer |

## Stack

- Java 21 (runs on 21 or newer), Spring Boot 4.1 (Spring Framework 7, Tomcat 11)
- Spring Web MVC, Bean Validation, Actuator (health, info, metrics), virtual threads
- JUnit 6, AssertJ, MockMvc
- Maven via the Maven Wrapper: nothing to install besides a JDK. The wrapper
  downloads Maven 3.9.16 once, pinned by its SHA-256 checksum.

## Design

- **Strategy pattern**: each rule (`FraudRules.*`) implements `RiskRule` and is a
  Spring bean. `RiskEngine` receives `List<RiskRule>` by constructor injection,
  so adding a rule is adding a class.
- **Records** for immutable value objects (`RiskFacts`, `RuleHit`, `RiskAssessment`)
  and enums with behaviour (`RiskLevel.forScore`, `RiskDecision.forLevel`).
- **Validation at the edge**: `RiskRequest` uses Bean Validation; errors come
  back as RFC 9457 problem details with field messages.
- **Service-to-service auth**: `ApiKeyFilter` checks `X-Api-Key` with a
  constant-time comparison; `/actuator/health` stays open for probes.
- **Parity with the fallback**: the rules, weights and bands match
  `backend/apps/api/src/modules/risk/risk-rules.ts`. The API calls this service
  through a circuit breaker and runs the same rules in-process when it is down,
  so a decision never depends on which engine answered.

## API

```http
POST /api/v1/risk/assess
X-Api-Key: <RISK_ENGINE_API_KEY from backend/.env>
Content-Type: application/json

{
  "amount": 12345600, "rail": "NEFT", "channel": "NET_BANKING", "ownAccountTransfer": false,
  "beneficiaryAgeHours": 3, "transfersLastHour": 0, "amountLast24h": 0, "dailyLimit": 100000000,
  "averageDebit90d": 10000000, "hourOfDayIst": 11, "accountAgeDays": 400, "kycVerified": true
}
```

```json
{
  "score": 45, "level": "MEDIUM", "decision": "STEP_UP",
  "reasons": ["Large amount (Rs 1 lakh or more)", "Payee was added in the last 24 hours"],
  "hits": [{ "rule": "HIGH_AMOUNT", "points": 20, "reason": "..." }, { "rule": "NEW_BENEFICIARY", "points": 25, "reason": "..." }],
  "source": "JAVA_ENGINE", "engineVersion": "java-rules-1.0"
}
```

Amounts are in paise (1 rupee = 100 paise). Other endpoints: `GET /api/v1/risk/rules`,
`GET /actuator/health`, `GET /actuator/info`, `GET /actuator/metrics`.

## Running it

From the repository root (it also starts with `npm run dev`):

```bash
npm run dev:risk     # start on port 8085 with the API key from backend/.env
npm run test:java    # JUnit tests
```

Or directly with the wrapper (`mvnw.cmd` on Windows):

```bash
cd services/risk-engine
./mvnw test
./mvnw spring-boot:run
./mvnw package && java -jar target/risk-engine-1.0.0.jar
```

## Resilience on the API side

`backend/apps/api/src/common/resilience/circuit-breaker.ts`: after 3 consecutive
failures (timeout 800 ms, network error or malformed answer) the circuit opens
and calls fail fast for 30 seconds; then one trial call decides whether to close
it again. Stop this service while the app is running: transfers keep working,
the staff dashboard shows "Fallback rules", and each transaction records which
engine scored it.

## Troubleshooting

**"Unable to establish loopback connection" on Windows.** Since JDK 16 the NIO
selector's internal pipe uses a Unix-domain socket in the temp folder; if the
Windows user name contains a space, connecting to it fails and Tomcat cannot
start. `run-dev.mjs` handles this by passing
`-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp`. When starting the jar yourself, add
that flag (any writable folder without spaces works).
