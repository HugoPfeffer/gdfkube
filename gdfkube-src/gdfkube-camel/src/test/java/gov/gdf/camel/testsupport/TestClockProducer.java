package gov.gdf.camel.testsupport;

import java.time.Clock;
import java.time.Instant;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Alternative;
import jakarta.enterprise.inject.Produces;

@ApplicationScoped
public class TestClockProducer {

    private static final MutableClock INSTANCE =
            new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));

    @Produces
    @Alternative
    @Priority(1)
    @ApplicationScoped
    public Clock testClock() {
        return INSTANCE;
    }

    public static MutableClock getMutableClock() {
        return INSTANCE;
    }
}
