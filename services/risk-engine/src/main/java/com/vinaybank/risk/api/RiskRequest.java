package com.vinaybank.risk.api;

import com.vinaybank.risk.engine.RiskModels.RiskFacts;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Request body of POST /api/v1/risk/assess, validated with Bean Validation
 * before any rule runs. Amounts are in paise.
 */
public record RiskRequest(
    @NotNull @PositiveOrZero Long amount,
    @NotBlank @Size(max = 12) String rail,
    @NotBlank @Size(max = 20) String channel,
    @NotNull Boolean ownAccountTransfer,
    @PositiveOrZero Double beneficiaryAgeHours,
    @NotNull @PositiveOrZero Integer transfersLastHour,
    @NotNull @PositiveOrZero Long amountLast24h,
    @NotNull @PositiveOrZero Long dailyLimit,
    @NotNull @PositiveOrZero Long averageDebit90d,
    @NotNull @Min(0) @Max(23) Integer hourOfDayIst,
    @NotNull @PositiveOrZero Integer accountAgeDays,
    @NotNull Boolean kycVerified) {

  public RiskFacts toFacts() {
    return new RiskFacts(
        amount,
        rail,
        channel,
        ownAccountTransfer,
        beneficiaryAgeHours,
        transfersLastHour,
        amountLast24h,
        dailyLimit,
        averageDebit90d,
        hourOfDayIst,
        accountAgeDays,
        kycVerified);
  }
}
