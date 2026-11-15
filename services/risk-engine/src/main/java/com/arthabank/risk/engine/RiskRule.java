package com.arthabank.risk.engine;

import com.arthabank.risk.engine.RiskModels.RiskFacts;
import com.arthabank.risk.engine.RiskModels.RuleHit;
import java.util.Optional;

/**
 * Strategy pattern: every fraud rule is a separate class implementing this
 * interface and registered as a Spring bean. The engine receives all of them
 * through dependency injection, so a new rule is a new class and nothing else
 * changes (open/closed principle).
 */
public interface RiskRule {

  /** Stable identifier, also used by the API's local fallback rules. */
  String id();

  /** A hit with points and a reason, or empty when the rule does not apply. */
  Optional<RuleHit> evaluate(RiskFacts facts);

  default Optional<RuleHit> hit(int points, String reason) {
    return Optional.of(new RuleHit(id(), points, reason));
  }
}
