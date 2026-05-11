#!/bin/sh
set -e
URL="http://gdfkube-debezium-connect:8083/connectors/gdfkube-mongo-source/config"
for i in 1 2 3; do
  if curl -sf -X PUT -H 'Content-Type: application/json' --data @/connector-config.json "$URL"; then
    echo ""
    echo "connector registered"
    exit 0
  fi
  echo "retry $i..."
  sleep 2
done
echo "connector registration failed"
exit 1
