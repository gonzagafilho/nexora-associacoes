#!/usr/bin/env bash
set -euo pipefail

curl -X POST "${BOLEPIX_API_URL:-http://127.0.0.1:3060}/api/bolepix/webhooks/mercadopago" \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","action":"payment.updated","data":{"id":"164519956309"}}'
