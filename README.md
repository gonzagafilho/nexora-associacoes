# Nexora Associações / BolePix

## Webhook Mercado Pago

O endpoint público para notificações Pix é:

    POST https://SEU_DOMINIO/api/bolepix/webhooks/mercadopago

Ele não usa autenticação JWT. O proxy Nginx deve encaminhar `/api/` para o
backend na porta `3060`, preservando método, corpo JSON e cabeçalhos.

Teste local:

    curl -X POST http://127.0.0.1:3060/api/bolepix/webhooks/mercadopago \
      -H "Content-Type: application/json" \
      -d '{"type":"payment","action":"payment.updated","data":{"id":"164519956309"}}'

## Boleto Mercado Pago

A geração de boleto usa o endpoint autenticado:

    POST /api/invoices/:id/boleto/mercadopago

A associação configura o recurso por:

    PUT /api/me/billing-settings/boleto

Campos aceitos: `boletoEnabled`, `boletoFeeAmount`, `boletoFeeMode` (`fixed` ou
`percent`), `boletoInstructions` e `boletoDueDays` (1 a 30).

O associado precisa ter nome, CPF válido, e-mail, endereço, número, bairro,
cidade, UF e CEP. A taxa configurada é somada ao valor da mensalidade antes da
criação do boleto. O webhook Mercado Pago usado pelo Pix também processa a
baixa automática do boleto.

## Configuração Mercado Pago por associação

Endpoints administrativos protegidos:

    GET  /api/me/mercadopago-settings
    PUT  /api/me/mercadopago-settings
    POST /api/me/mercadopago-settings/test
    POST /api/me/mercadopago-settings/webhook-url

Access Token, Client Secret e Webhook Secret são criptografados com AES-256-GCM.
Configure `APP_SECRET` ou `CREDENTIALS_ENCRYPTION_KEY` em produção. Credenciais
salvas nunca são devolvidas pela API; o GET retorna apenas versões mascaradas.

Enquanto um tenant ainda não possuir configuração própria, o token global é
usado como fallback controlado para preservar cobranças existentes. Após criar
a configuração do tenant, Pix e boleto respeitam as habilitações e o token da
associação.

O módulo visual da aba está em:

    frontend-admin/src/modules/settings/MercadoPagoSettings.js

Como o frontend Admin desta workspace ainda não possui aplicação ou roteador,
o módulo exporta `mountMercadoPagoSettings(container, { token })` para ser
montado pela futura página Admin > Configurações.

## Publicação associacoes.nexoracloud.com.br

Arquivos preparados:

    deploy/nginx/associacoes.nexoracloud.com.br.conf
    deploy/www/associacoes-nexoracloud/index.html
    deploy/install-production.sh

A aplicação final exige privilégios administrativos para escrever em
`/etc/nginx`, `/var/www` e emitir o certificado. Execute no servidor:

    cd /home/servidor-dcnet/apps/associacao-bolepix
    ./deploy/install-production.sh

## NEXORA Admin

Painel administrativo:

    https://associacoes.nexoracloud.com.br/admin/

Build:

    cd frontend-admin
    npm run check
    npm run build

Publicação no servidor:

    cd /home/servidor-dcnet/apps/associacao-bolepix
    ./deploy/install-admin.sh

O instalador preserva SSL, faz backup do virtual host, publica a landing NEXORA
e o build do Admin, valida `nginx -t` e só então recarrega o Nginx.
