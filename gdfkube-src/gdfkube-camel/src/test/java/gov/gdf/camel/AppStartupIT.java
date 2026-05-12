package gov.gdf.camel;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;

import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import io.quarkus.test.junit.QuarkusIntegrationTest;

/**
 * Boots the packaged Quarkus jar against the PROD classpath (unlike @QuarkusTest
 * which uses the test classpath and masks missing extensions) and asserts the
 * SmallRye liveness endpoint reports UP. Liveness UP proves the JVM finished
 * Quarkus startup without throwing, which proves every Camel route built — the
 * exact failure mode of the missing-extension bug class. Liveness (not
 * readiness) keeps the test independent of Mongo/Kafka being reachable in CI.
 */
@QuarkusIntegrationTest
class AppStartupIT {
    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    void startsCleanly() {
        given()
            .get("/q/health/live")
            .then()
                .statusCode(200)
                .body("status", equalTo("UP"));
    }
}
