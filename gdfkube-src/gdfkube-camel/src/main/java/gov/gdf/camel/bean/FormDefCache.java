package gov.gdf.camel.bean;

import java.util.concurrent.ConcurrentHashMap;

import org.bson.Document;
import org.jboss.logging.Logger;

import com.mongodb.client.MongoClient;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class FormDefCache {

    private static final Logger LOG = Logger.getLogger(FormDefCache.class);

    private final ConcurrentHashMap<String, Document> cache = new ConcurrentHashMap<>();

    @Inject
    MongoClient mongoClient;

    public Document lookup(String formId) {
        return cache.computeIfAbsent(formId, this::fetchFromMongo);
    }

    public void refresh(String formId) {
        Document doc = fetchFromMongo(formId);
        cache.put(formId, doc);
        LOG.infof("FormDefCache invalidated formId=%s", formId);
    }

    private Document fetchFromMongo(String formId) {
        return mongoClient.getDatabase("gdfkube")
                .getCollection("forms")
                .find(new Document("_id", formId))
                .first();
    }
}
