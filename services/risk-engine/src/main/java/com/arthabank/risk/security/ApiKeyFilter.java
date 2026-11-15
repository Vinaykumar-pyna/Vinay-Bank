package com.arthabank.risk.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Service-to-service authentication: every /api request must carry the shared
 * key in the X-Api-Key header. The comparison is constant-time, so the key
 * cannot be guessed byte by byte from response timings. Actuator health stays
 * open for load balancers and container orchestrators.
 */
@Component
public class ApiKeyFilter extends OncePerRequestFilter {

  static final String HEADER = "X-Api-Key";

  private final byte[] expected;

  public ApiKeyFilter(@Value("${risk.api-key:}") String apiKey) {
    this.expected = apiKey.getBytes(StandardCharsets.UTF_8);
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().startsWith("/api/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (expected.length == 0) {
      reject(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "The risk engine API key is not configured");
      return;
    }
    String given = request.getHeader(HEADER);
    if (given == null || !MessageDigest.isEqual(expected, given.getBytes(StandardCharsets.UTF_8))) {
      reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Missing or invalid X-Api-Key");
      return;
    }
    chain.doFilter(request, response);
  }

  private void reject(HttpServletResponse response, int status, String detail) throws IOException {
    response.setStatus(status);
    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    response
        .getWriter()
        .write("{\"status\":" + status + ",\"title\":\"Unauthorized\",\"detail\":\"" + detail + "\"}");
  }
}
