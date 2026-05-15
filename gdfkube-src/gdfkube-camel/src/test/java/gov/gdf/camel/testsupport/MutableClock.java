package gov.gdf.camel.testsupport;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

public class MutableClock extends Clock {

    private volatile Instant now;
    private final ZoneId zone = ZoneOffset.UTC;

    public MutableClock(Instant start) {
        this.now = start;
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId z) {
        throw new UnsupportedOperationException();
    }

    @Override
    public Instant instant() {
        return now;
    }

    public synchronized void set(Instant i) {
        this.now = i;
    }

    public synchronized void advance(Duration d) {
        this.now = this.now.plus(d);
    }
}
