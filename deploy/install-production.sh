#!/usr/bin/env bash
set -euo pipefail

DOMAIN="associacoes.nexoracloud.com.br"
PROJECT="/home/servidor-dcnet/apps/associacao-bolepix"
WEBROOT="/var/www/associacoes-nexoracloud"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"

sudo install -d -m 0755 "$WEBROOT"
sudo install -m 0644 "$PROJECT/deploy/www/associacoes-nexoracloud/index.html" "$WEBROOT/index.html"
sudo install -m 0644 "$PROJECT/deploy/nginx/${DOMAIN}.conf" "$NGINX_SITE"
sudo ln -sfn "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"

sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  -d "$DOMAIN"

sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run

curl -fsSI "https://${DOMAIN}/"
curl -fsS "https://${DOMAIN}/health"
curl -fsS -X POST "https://${DOMAIN}/api/bolepix/webhooks/mercadopago" \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","action":"payment.updated","data":{"id":"164519956309"}}'
