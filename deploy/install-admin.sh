#!/usr/bin/env bash
set -euo pipefail

PROJECT="/home/servidor-dcnet/apps/associacao-bolepix"
DOMAIN="associacoes.nexoracloud.com.br"
WEBROOT="/var/www/associacoes-nexoracloud"
LANDING="$PROJECT/deploy/www/associacoes-nexoracloud/index.html"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"

cd "$PROJECT/frontend-admin"
npm run check
npm run build

sudo install -m 0644 "$LANDING" "$WEBROOT/index.html"
sudo install -d -m 0755 "$WEBROOT/admin/assets"
sudo install -m 0644 dist/index.html "$WEBROOT/admin/index.html"
sudo install -m 0644 dist/assets/app.js "$WEBROOT/admin/assets/app.js"
sudo install -m 0644 dist/assets/api.js "$WEBROOT/admin/assets/api.js"
sudo install -m 0644 dist/assets/styles.css "$WEBROOT/admin/assets/styles.css"

sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak-$(date +%Y%m%d-%H%M%S)"
sudo install -m 0644 "$PROJECT/deploy/nginx/${DOMAIN}.conf" "$NGINX_SITE"
sudo nginx -t
sudo systemctl reload nginx

curl -fsSI "https://${DOMAIN}/admin/"
curl -fsS "https://${DOMAIN}/health"
