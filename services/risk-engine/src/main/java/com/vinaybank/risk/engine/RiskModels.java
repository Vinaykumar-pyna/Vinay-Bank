package com.vinaybank.risk.engine;

import java.util.List;

/** Value types of the risk engine. Amounts are in paise (1 rupee = 100 paise). */
public final class RiskModels {

  private RiskModels() {}

  /** Facts about one transfer, as sent by the core banking API. */
  public record RiskFacts(
      long amount,
      String rail,
      String channel,
      boolean ownAccountTransfer,
      Double beneficiaryAgeHours,
      int transfersLastHour,
      long amountLast24h,
      long dailyLimit,
      long averageDebit90d,
      int hourOfDayIst,
      int accountAgeDays,
      boolean kycVerified) {}

  /** One rule that fired: its id, its weight and a reason a customer can read. */
  public record RuleHit(String rule, int points, String reason) {}

  public enum RiskLevel {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL;

    public static RiskLevel forScore(int score) {
      if (score >= 80) return CRITICAL;
      if (score >= 60) return HIGH;
      if (score >= 30) return MEDIUM;
      return LOW;
    }
  }

  /** ALLOW: proceed; STEP_UP: extra OTP; REVIEW: maker-checker hold; BLOCK: refuse. */
  public enum RiskDecision {
    ALLOW,
    STEP_UP,
    REVIEW,
    BLOCK;

    public static RiskDecision forLevel(RiskLevel level) {
      return switch (level) {
        case LOW -> ALLOW;
        case MEDIUM -> STEP_UP;
        case HIGH -> REVIEW;
        case CRITICAL -> BLOCK;
      };
    }
  }

  public record RiskAssessment(
      int score,
      RiskLevel level,
      RiskDecision decision,
      List<String> reasons,
      List<RuleHit> hits,
      String source,
      String engineVersion) {}
}
