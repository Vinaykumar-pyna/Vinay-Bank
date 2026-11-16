package com.vinaybank.risk.engine;

import com.vinaybank.risk.engine.RiskModels.RiskAssessment;
import com.vinaybank.risk.engine.RiskModels.RiskDecision;
import com.vinaybank.risk.engine.RiskModels.RiskFacts;
import com.vinaybank.risk.engine.RiskModels.RiskLevel;
import com.vinaybank.risk.engine.RiskModels.RuleHit;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * Scores a transfer: the sum of the points of every rule that fires, capped
 * at 100. Transfers between a customer's own accounts are trusted.
 */
@Service
public class RiskEngine {

  public static final String VERSION = "java-rules-1.0";

  private final List<RiskRule> rules;

  public RiskEngine(List<RiskRule> rules) {
    this.rules = List.copyOf(rules);
  }

  public RiskAssessment assess(RiskFacts facts) {
    List<RuleHit> hits =
        facts.ownAccountTransfer()
            ? List.of()
            : rules.stream().map(rule -> rule.evaluate(facts)).flatMap(Optional::stream).toList();
    int score = Math.min(100, hits.stream().mapToInt(RuleHit::points).sum());
    RiskLevel level = RiskLevel.forScore(score);
    return new RiskAssessment(
        score,
        level,
        RiskDecision.forLevel(level),
        hits.stream().map(RuleHit::reason).toList(),
        hits,
        "JAVA_ENGINE",
        VERSION);
  }

  public List<String> ruleIds() {
    return rules.stream().map(RiskRule::id).toList();
  }
}
