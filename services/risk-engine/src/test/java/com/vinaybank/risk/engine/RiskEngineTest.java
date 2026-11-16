package com.vinaybank.risk.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.vinaybank.risk.engine.RiskModels.RiskAssessment;
import com.vinaybank.risk.engine.RiskModels.RiskDecision;
import com.vinaybank.risk.engine.RiskModels.RiskFacts;
import com.vinaybank.risk.engine.RiskModels.RiskLevel;
import com.vinaybank.risk.engine.RiskModels.RuleHit;
import com.vinaybank.risk.engine.rules.FraudRules;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class RiskEngineTest {

  private static final long RUPEE = 100;

  private final RiskEngine engine =
      new RiskEngine(
          List.of(
              new FraudRules.HighAmount(),
              new FraudRules.NewBeneficiary(),
              new FraudRules.Velocity(),
              new FraudRules.DailyVolume(),
              new FraudRules.OddHour(),
              new FraudRules.UnusualAmount(),
              new FraudRules.RoundAmount(),
              new FraudRules.NewAccount(),
              new FraudRules.KycPending()));

  /** An ordinary daytime transfer to a long-standing payee from an established, verified account. */
  private static RiskFacts everyday(long amount) {
    return new RiskFacts(amount, "IMPS", "NET_BANKING", false, 720.0, 0, 0, 10_00_000 * RUPEE, 5_000 * RUPEE, 14, 400, true);
  }

  @Test
  @DisplayName("an everyday transfer is allowed with no reasons")
  void everydayTransferIsAllowed() {
    RiskAssessment result = engine.assess(everyday(2_500 * RUPEE));
    assertThat(result.score()).isZero();
    assertThat(result.decision()).isEqualTo(RiskDecision.ALLOW);
    assertThat(result.source()).isEqualTo("JAVA_ENGINE");
  }

  @Test
  @DisplayName("a large amount to a payee added today needs an OTP")
  void newPayeeAndLargeAmountStepsUp() {
    RiskFacts facts =
        new RiskFacts(1_23_456 * RUPEE, "NEFT", "NET_BANKING", false, 3.0, 0, 0, 10_00_000 * RUPEE, 1_00_000 * RUPEE, 11, 400, true);
    RiskAssessment result = engine.assess(facts);
    assertThat(result.hits()).extracting(RuleHit::rule).containsExactly("HIGH_AMOUNT", "NEW_BENEFICIARY");
    assertThat(result.score()).isEqualTo(45);
    assertThat(result.level()).isEqualTo(RiskLevel.MEDIUM);
    assertThat(result.decision()).isEqualTo(RiskDecision.STEP_UP);
  }

  @Test
  @DisplayName("a classic mule pattern is blocked")
  void mulePatternIsBlocked() {
    RiskFacts facts =
        new RiskFacts(6_00_000 * RUPEE, "RTGS", "NET_BANKING", false, 0.5, 0, 0, 0, 0, 2, 3, false);
    RiskAssessment result = engine.assess(facts);
    // 35 very large + 35 brand-new payee + 10 odd hour + 5 round + 10 new account + 10 KYC = 105, capped
    assertThat(result.score()).isEqualTo(100);
    assertThat(result.level()).isEqualTo(RiskLevel.CRITICAL);
    assertThat(result.decision()).isEqualTo(RiskDecision.BLOCK);
    assertThat(result.reasons()).contains("Payee was added less than an hour ago", "KYC not yet verified");
  }

  @Test
  @DisplayName("moving money between one's own accounts is trusted")
  void ownAccountTransferIsTrusted() {
    RiskFacts facts =
        new RiskFacts(9_00_000 * RUPEE, "INTERNAL", "NET_BANKING", true, null, 9, 0, 0, 0, 1, 1, false);
    assertThat(engine.assess(facts).score()).isZero();
  }

  @ParameterizedTest(name = "score {0} -> {1} / {2}")
  @CsvSource({"0,LOW,ALLOW", "29,LOW,ALLOW", "30,MEDIUM,STEP_UP", "59,MEDIUM,STEP_UP", "60,HIGH,REVIEW", "79,HIGH,REVIEW", "80,CRITICAL,BLOCK", "100,CRITICAL,BLOCK"})
  @DisplayName("score bands map to the same levels and decisions as the API's fallback rules")
  void scoreBands(int score, RiskLevel level, RiskDecision decision) {
    assertThat(RiskLevel.forScore(score)).isEqualTo(level);
    assertThat(RiskDecision.forLevel(level)).isEqualTo(decision);
  }

  @Test
  @DisplayName("velocity, daily volume and unusual amounts are each detected")
  void behaviouralRules() {
    RiskFacts facts =
        new RiskFacts(90_500 * RUPEE, "IMPS", "NET_BANKING", false, 1000.0, 6, 50_000 * RUPEE, 1_50_000 * RUPEE, 4_000 * RUPEE, 13, 400, true);
    assertThat(engine.assess(facts).hits())
        .extracting(RuleHit::rule)
        .containsExactly("VELOCITY", "DAILY_VOLUME", "UNUSUAL_AMOUNT");
  }
}
