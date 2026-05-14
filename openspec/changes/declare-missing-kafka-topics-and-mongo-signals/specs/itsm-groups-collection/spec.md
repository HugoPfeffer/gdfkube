## REMOVED Requirements

### Requirement: Groups Not in CDC Include List

**Reason**: This requirement contradicts shipped behaviour. The `auto-provision-org-resources-from-group-events` change added `gdfkube.groups` to Debezium's `collection.include.list`, and `OrgBootstrapRoute.java:61` actively consumes `kafka:dbz.gdfkube.groups`. Asserting that groups is NOT in the include list is therefore false as of that change.

**Migration**: No caller migration is required — the assertion was never satisfied by code shipped after `auto-provision-org-resources-from-group-events`. The `gdfkube-infra/debezium/connector-config.json` `collection.include.list` already includes `gdfkube.groups`. Coverage for the *current* (correct) behaviour — that groups IS watched, and the resulting `dbz.gdfkube.groups` topic is consumed by `OrgBootstrapRoute` — lives in the `auto-provision-org-resources-from-group-events`-era requirements and in `kafka-broker-stack`'s catalog-coverage requirement (which this change bumps from 9 to 11 catalog rows to include the two `groups`-derived topics).
