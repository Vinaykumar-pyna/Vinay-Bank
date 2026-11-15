# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk AS build
# Without unzip the Maven Wrapper silently downloads the .tar.gz distribution,
# whose SHA-256 differs from the .zip checksum pinned in .mvn/wrapper.
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q package -DskipTests

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 risk
WORKDIR /app
COPY --from=build /src/target/risk-engine-1.0.0.jar risk-engine.jar
USER risk
ENV RISK_ENGINE_BIND=0.0.0.0
EXPOSE 8085
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/risk-engine.jar"]
