package com.vinaybank.risk;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Vinay Bank fraud risk engine. The core banking API (NestJS) asks it to score
 * each transfer; it answers with a score, a level, a decision and the reasons.
 */
@SpringBootApplication
public class RiskEngineApplication {

  public static void main(String[] args) {
    SpringApplication.run(RiskEngineApplication.class, args);
  }
}
