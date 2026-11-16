package com.vinaybank.risk.engine.rules;

import com.vinaybank.risk.engine.RiskModels.RiskFacts;
import com.vinaybank.risk.engine.RiskModels.RuleHit;
import com.vinaybank.risk.engine.RiskRule;
import java.util.Optional;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * The fraud rules, one Spring component each. Weights and thresholds match
 * the API's local fallback (backend/apps/api/src/modules/risk/risk-rules.ts),
 * so a decision does not change when the API has to fall back.
 */
public final class FraudRules {

  private FraudRules() {}

  static final long RUPEE = 100;

  @Component
  @Order(1)
  public static class HighAmount implements RiskRule {
    public String id() {
      return "HIGH_AMOUNT";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      if (f.amount() >= 500_000 * RUPEE) return hit(35, "Very large amount (Rs 5 lakh or more)");
      if (f.amount() >= 100_000 * RUPEE) return hit(20, "Large amount (Rs 1 lakh or more)");
      return Optional.empty();
    }
  }

  @Component
  @Order(2)
  public static class NewBeneficiary implements RiskRule {
    public String id() {
      return "NEW_BENEFICIARY";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      Double age = f.beneficiaryAgeHours();
      if (age == null) return Optional.empty();
      if (age < 1) return hit(35, "Payee was added less than an hour ago");
      if (age < 24) return hit(25, "Payee was added in the last 24 hours");
      return Optional.empty();
    }
  }

  @Component
  @Order(3)
  public static class Velocity implements RiskRule {
    public String id() {
      return "VELOCITY";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      return f.transfersLastHour() >= 5
          ? hit(20, f.transfersLastHour() + " transfers in the last hour")
          : Optional.empty();
    }
  }

  @Component
  @Order(4)
  public static class DailyVolume implements RiskRule {
    public String id() {
      return "DAILY_VOLUME";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      return f.dailyLimit() > 0 && f.amountLast24h() + f.amount() >= 0.8 * f.dailyLimit()
          ? hit(15, "Close to the daily transfer limit")
          : Optional.empty();
    }
  }

  @Component
  @Order(5)
  public static class OddHour implements RiskRule {
    public String id() {
      return "ODD_HOUR";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      return f.hourOfDayIst() < 5
          ? hit(10, "Unusual time of day (midnight to 5 AM)")
          : Optional.empty();
    }
  }

  @Component
  @Order(6)
  public static class UnusualAmount implements RiskRule {
    public String id() {
      return "UNUSUAL_AMOUNT";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      return f.averageDebit90d() > 0
              && f.amount() > 5 * f.averageDebit90d()
              && f.amount() > 25_000 * RUPEE
          ? hit(20, "Much larger than your usual payments")
          : Optional.empty();
    }
  }

  @Component
  @Order(7)
  public static class RoundAmount implements RiskRule {
    public String id() {
      return "ROUND_AMOUNT";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      return f.amount() >= 50_000 * RUPEE && f.amount() % (10_000 * RUPEE) == 0
          ? hit(5, "Large round-figure amount")
          : Optional.empty();
    }
  }

  @Component
  @Order(8)
  public static class NewAccount implements RiskRule {
    public String id() {
      return "NEW_ACCOUNT";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      return f.accountAgeDays() < 7 ? hit(10, "Account opened in the last 7 days") : Optional.empty();
    }
  }

  @Component
  @Order(9)
  public static class KycPending implements RiskRule {
    public String id() {
      return "KYC_PENDING";
    }

    public Optional<RuleHit> evaluate(RiskFacts f) {
      return f.kycVerified() ? Optional.empty() : hit(10, "KYC not yet verified");
    }
  }
}
