package gov.gdf.camel.bean;

import org.bson.Document;
import org.jboss.logging.Logger;

import com.mongodb.client.MongoClient;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Writes the pipeline stage back to the Mongo {@code requests} collection using
 * {@code $max} so that out-of-order or retried writes can never roll the
 * persisted stage backwards. The {@code _stageWriteback} marker is set on every
 * call so the Debezium CDC consumer ({@link gov.gdf.camel.routes.RequestRouterRoute})
 * can distinguish a stage-only update from a real status change and avoid an
 * approval loop.
 */
@ApplicationScoped
public class StageUpdater {

    private static final Logger LOG = Logger.getLogger(StageUpdater.class);
    private static final String DATABASE = "gdfkube";
    private static final String COLLECTION = "requests";

    @Inject
    MongoClient mongoClient;

    /**
     * Set the persisted stage to {@code max(currentStage, stage)}. Always
     * stamps {@code _stageWriteback=true} so the writeback is filtered out of
     * the CDC pipeline.
     *
     * @param requestId Mongo {@code _id} of the request document
     * @param stage     the stage to advance to; never moves the document
     *                  backwards
     */
    public void updateStage(String requestId, int stage) {
        if (requestId == null || requestId.isBlank()) {
            LOG.warnf("Skipping stage update with empty requestId (stage=%d)", stage);
            return;
        }
        try {
            mongoClient.getDatabase(DATABASE)
                    .getCollection(COLLECTION)
                    .updateOne(
                            new Document("_id", requestId),
                            new Document("$max", new Document("stage", stage))
                                    .append("$set", new Document("_stageWriteback", true)));
            LOG.debugf("Stage updateOne($max) requestId=%s stage=%d", requestId, stage);
        } catch (RuntimeException e) {
            // Mongo writebacks are best-effort: if they fail we do NOT want to
            // poison the route and trip the DLQ. The SPA can still derive the
            // stage from the pipeline.status Kafka topic.
            LOG.warnf(e, "Stage writeback failed (requestId=%s stage=%d): %s",
                    requestId, stage, e.getMessage());
        }
    }
}
