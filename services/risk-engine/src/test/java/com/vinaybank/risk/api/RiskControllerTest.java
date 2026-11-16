package com.vinaybank.risk.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vinaybank.risk.security.ApiKeyFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** Full application context, exercised through MockMvc with the API key filter in front. */
@SpringBootTest(properties = "risk.api-key=test-key-123")
class RiskControllerTest {

  private static final String BODY =
      """
      {
        "amount": 12345600, "rail": "NEFT", "channel": "NET_BANKING", "ownAccountTransfer": false,
        "beneficiaryAgeHours": 3, "transfersLastHour": 0, "amountLast24h": 0, "dailyLimit": 100000000,
        "averageDebit90d": 10000000, "hourOfDayIst": 11, "accountAgeDays": 400, "kycVerified": true
      }
      """;

  @Autowired private WebApplicationContext context;
  @Autowired private ApiKeyFilter apiKeyFilter;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(apiKeyFilter).build();
  }

  @Test
  void scoresATransfer() throws Exception {
    mvc.perform(
            post("/api/v1/risk/assess")
                .header("X-Api-Key", "test-key-123")
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.score").value(45))
        .andExpect(jsonPath("$.level").value("MEDIUM"))
        .andExpect(jsonPath("$.decision").value("STEP_UP"))
        .andExpect(jsonPath("$.source").value("JAVA_ENGINE"))
        .andExpect(jsonPath("$.hits[0].rule").value("HIGH_AMOUNT"));
  }

  @Test
  void refusesCallersWithoutTheKey() throws Exception {
    mvc.perform(post("/api/v1/risk/assess").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/v1/risk/assess")
                .header("X-Api-Key", "wrong")
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void validatesTheRequest() throws Exception {
    String invalid = BODY.replace("\"hourOfDayIst\": 11", "\"hourOfDayIst\": 30").replace("\"amount\": 12345600", "\"amount\": -5");
    mvc.perform(
            post("/api/v1/risk/assess")
                .header("X-Api-Key", "test-key-123")
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalid))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(2));
  }

  @Test
  void healthIsPublic() throws Exception {
    mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
  }
}
