package gov.gdf.camel.bean;

import java.lang.reflect.Field;

import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.utility.DockerImageName;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Pure Testcontainers test for {@link StageUpdater} that verifies the
 * monotonic-stage semantics provided by the {@code $max} update operator.
 *
 * <p>Bypasses Quarkus DI on purpose so the test is independent of the rest of
 * the application wiring and runs fast against a real MongoDB.</p>
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StageUpdaterTest {

    private static final String DATABASE = "gdfkube";
    private static final String COLLECTION = "requests";

    private MongoDBContainer mongo;
    private MongoClient client;
    private StageUpdater stageUpdater;

    @BeforeAll
    void startMongo() throws Exception {
        mongo = new MongoDBContainer(DockerImageName.parse("mongo:7.0"));
        mongo.start();

        client = MongoClients.create(mongo.getReplicaSetUrl());

        stageUpdater = new StageUpdater();
        Field f = StageUpdater.class.getDeclaredField("mongoClient");
        f.setAccessible(true);
        f.set(stageUpdater, client);
    }

    @AfterAll
    void stopMongo() {
        if (client != null) {
            client.close();
        }
        if (mongo != null) {
            mongo.stop();
        }
    }

    @BeforeEach
    void clearCollection() {
        client.getDatabase(DATABASE).getCollection(COLLECTION).drop();
    }

    @Test
    void updateStage_setsStageOnNewDoc() {
        seed("REQ-1", 0);

        stageUpdater.updateStage("REQ-1", 4);

        Document after = findById("REQ-1");
        assertEquals(4, after.getInteger("stage"));
        assertTrue(after.getBoolean("_stageWriteback"),
                "Writeback marker must be set so CDC consumer can filter it out");
    }

    @Test
    void updateStage_advancesStageMonotonically() {
        seed("REQ-2", 0);

        stageUpdater.updateStage("REQ-2", 4);
        stageUpdater.updateStage("REQ-2", 5);

        assertEquals(5, findById("REQ-2").getInteger("stage"));
    }

    @Test
    void updateStage_doesNotRollBackStage() {
        // Doc already at stage 5 — a late $max(4) must be a no-op for "stage".
        seed("REQ-3", 5);

        stageUpdater.updateStage("REQ-3", 4);

        Document after = findById("REQ-3");
        assertEquals(5, after.getInteger("stage"),
                "$max must never roll the stage backwards");
    }

    @Test
    void updateStage_outOfOrderEventsConverge() {
        // Simulate the bug scenario: two events arrive out of order (5 then 4).
        // Final state must reflect the highest stage, not the most recent write.
        seed("REQ-4", 0);

        stageUpdater.updateStage("REQ-4", 5);
        stageUpdater.updateStage("REQ-4", 4);

        assertEquals(5, findById("REQ-4").getInteger("stage"),
                "Out-of-order stage events must converge on the maximum stage");
    }

    @Test
    void updateStage_missingDocIsNoop() {
        // No seed: updateOne with no match must not throw and must not insert.
        stageUpdater.updateStage("REQ-MISSING", 4);

        assertNull(findById("REQ-MISSING"),
                "Stage update must not upsert when the request doc does not exist");
    }

    @Test
    void updateStage_emptyRequestIdIsSkipped() {
        // Should not throw, should not write.
        stageUpdater.updateStage("", 4);
        stageUpdater.updateStage(null, 4);

        long count = client.getDatabase(DATABASE)
                .getCollection(COLLECTION)
                .countDocuments();
        assertEquals(0, count);
    }

    // --- helpers ---

    private void seed(String id, int stage) {
        client.getDatabase(DATABASE)
                .getCollection(COLLECTION)
                .insertOne(new Document("_id", id).append("stage", stage));
    }

    private Document findById(String id) {
        return client.getDatabase(DATABASE)
                .getCollection(COLLECTION)
                .find(new Document("_id", id))
                .first();
    }
}
