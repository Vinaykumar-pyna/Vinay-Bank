package com.vinaybank.risk.api;

import com.vinaybank.risk.engine.RiskEngine;
import com.vinaybank.risk.engine.RiskModels.RiskAssessment;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** REST API of the risk engine (JSON). Requires the X-Api-Key header, see ApiKeyFilter. */
@RestController
@RequestMapping("/api/v1/risk")
public class RiskController {

  private final RiskEngine engine;

  public RiskController(RiskEngine engine) {
    this.engine = engine;
  }

  @PostMapping("/assess")
  public RiskAssessment assess(@Valid @RequestBody RiskRequest request) {
    return engine.assess(request.toFacts());
  }

  @GetMapping("/rules")
  public Map<String, Object> rules() {
    List<String> ids = engine.ruleIds();
    return Map.of("engineVersion", RiskEngine.VERSION, "rules", ids);
  }
}
