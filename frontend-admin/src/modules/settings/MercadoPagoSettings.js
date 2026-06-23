import { apiRequest } from "../../lib/api.js";
import "./mercadoPagoSettings.css";

const secretFields = [
  ["mercadopagoAccessToken", "Access Token", "accessTokenMasked"],
  ["mercadopagoPublicKey", "Public Key", "publicKeyMasked"],
  ["mercadopagoClientSecret", "Client Secret", "clientSecretMasked"],
  ["mercadopagoWebhookSecret", "Webhook Secret", "webhookSecretMasked"]
];

function statusLabel(settings) {
  if (!settings.configured) return ["Não configurado", "neutral"];
  if (settings.mercadopagoLastTestStatus === "success") return ["Testado com sucesso", "success"];
  if (settings.mercadopagoLastTestStatus === "error") return ["Erro no teste", "error"];
  return ["Configurado", "warning"];
}

function field(name, label, value = "", type = "text") {
  return `
    <label class="mp-field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${String(value || "").replaceAll('"', '&quot;')}" />
    </label>`;
}

function secretField(name, label, masked) {
  return `
    <label class="mp-field mp-secret">
      <span>${label}</span>
      <div class="mp-secret-row">
        <input name="${name}" type="password" autocomplete="new-password"
          placeholder="${masked || "Não configurado"}" />
        <button type="button" data-toggle-secret="${name}">Mostrar</button>
      </div>
      <small>O valor salvo nunca é revelado. Deixe vazio para manter.</small>
    </label>`;
}

export async function mountMercadoPagoSettings(container, options = {}) {
  container.innerHTML = '<div class="mp-loading">Carregando Mercado Pago…</div>';
  const [mpResponse, meResponse] = await Promise.all([
    apiRequest("/api/me/mercadopago-settings", { token: options.token }),
    apiRequest("/api/me", { token: options.token })
  ]);
  const settings = mpResponse.settings || {};
  const billing = meResponse.billingSettings || {};
  const [label, tone] = statusLabel(settings);

  container.innerHTML = `
    <section class="mp-settings-card">
      <header class="mp-header">
        <div>
          <p class="mp-eyebrow">Admin › Configurações</p>
          <h2>Mercado Pago</h2>
          <p>Credenciais e meios de pagamento exclusivos desta associação.</p>
        </div>
        <span class="mp-status mp-status-${tone}" data-status>${label}</span>
      </header>

      <form data-mp-form>
        <div class="mp-switches">
          <label><input name="mercadopagoEnabled" type="checkbox" ${settings.mercadopagoEnabled ? "checked" : ""}> Ativar Mercado Pago</label>
          <label><input name="mercadopagoPixEnabled" type="checkbox" ${settings.mercadopagoPixEnabled ? "checked" : ""}> Pix habilitado</label>
          <label><input name="mercadopagoBoletoEnabled" type="checkbox" ${settings.mercadopagoBoletoEnabled ? "checked" : ""}> Boleto habilitado</label>
        </div>

        <div class="mp-grid">
          <label class="mp-field"><span>Ambiente</span><select name="mercadopagoEnvironment">
            <option value="production" ${settings.mercadopagoEnvironment !== "sandbox" ? "selected" : ""}>Produção</option>
            <option value="sandbox" ${settings.mercadopagoEnvironment === "sandbox" ? "selected" : ""}>Sandbox</option>
          </select></label>
          ${field("mercadopagoClientId", "Client ID", settings.mercadopagoClientId)}
          ${field("mercadopagoStatementDescriptor", "Descrição na fatura", settings.mercadopagoStatementDescriptor)}
          ${field("mercadopagoNotificationEmail", "E-mail de notificação", settings.mercadopagoNotificationEmail, "email")}
          ${secretFields.map(([name, secretLabel, mask]) => secretField(name, secretLabel, settings[mask])).join("")}
        </div>

        <div class="mp-boleto-box">
          <h3>Boleto e lotérica</h3>
          <div class="mp-grid">
            ${field("mercadopagoBoletoMethod", "Método", settings.mercadopagoBoletoMethod || "bolbradesco")}
            <label class="mp-field"><span>Tipo da taxa</span><select name="boletoFeeMode">
              <option value="fixed" ${billing.boletoFeeMode !== "percent" ? "selected" : ""}>Fixa</option>
              <option value="percent" ${billing.boletoFeeMode === "percent" ? "selected" : ""}>Percentual</option>
            </select></label>
            ${field("boletoFeeAmount", "Valor da taxa", billing.boletoFeeAmount || 0, "number")}
            ${field("boletoDueDays", "Vencimento em dias", billing.boletoDueDays || 3, "number")}
          </div>
          <label class="mp-field"><span>Instruções do boleto</span>
            <textarea name="boletoInstructions">${billing.boletoInstructions || ""}</textarea>
          </label>
        </div>

        <label class="mp-field mp-webhook"><span>URL pública do webhook</span>
          <div><input readonly value="${mpResponse.webhookUrl || ""}" data-webhook><button type="button" data-copy-webhook>Copiar</button></div>
        </label>

        <div class="mp-feedback" data-feedback></div>
        <footer class="mp-actions">
          <button class="mp-button-secondary" type="button" data-test>Testar conexão</button>
          <button class="mp-button-primary" type="submit">Salvar</button>
        </footer>
      </form>
    </section>`;

  const form = container.querySelector("[data-mp-form]");
  const feedback = container.querySelector("[data-feedback]");
  const setFeedback = (message, error = false) => {
    feedback.textContent = message;
    feedback.className = `mp-feedback ${error ? "is-error" : "is-success"}`;
  };

  container.querySelectorAll("[data-toggle-secret]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = form.elements[button.dataset.toggleSecret];
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Mostrar" : "Ocultar";
    });
  });
  container.querySelector("[data-copy-webhook]").addEventListener("click", async () => {
    await navigator.clipboard.writeText(container.querySelector("[data-webhook]").value);
    setFeedback("URL do webhook copiada.");
  });
  container.querySelector("[data-test]").addEventListener("click", async () => {
    try {
      setFeedback("Testando conexão…");
      const result = await apiRequest("/api/me/mercadopago-settings/test", {
        method: "POST",
        token: options.token
      });
      container.querySelector("[data-status]").textContent = "Testado com sucesso";
      setFeedback(`${result.message} Conta: ${result.accountHolderName || result.accountId}.`);
    } catch (error) {
      container.querySelector("[data-status]").textContent = "Erro no teste";
      setFeedback(error.message, true);
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const mpPayload = {
      mercadopagoEnabled: data.get("mercadopagoEnabled") === "on",
      mercadopagoEnvironment: data.get("mercadopagoEnvironment"),
      mercadopagoClientId: data.get("mercadopagoClientId"),
      mercadopagoStatementDescriptor: data.get("mercadopagoStatementDescriptor"),
      mercadopagoNotificationEmail: data.get("mercadopagoNotificationEmail"),
      mercadopagoPixEnabled: data.get("mercadopagoPixEnabled") === "on",
      mercadopagoBoletoEnabled: data.get("mercadopagoBoletoEnabled") === "on",
      mercadopagoBoletoMethod: data.get("mercadopagoBoletoMethod")
    };
    for (const [name] of secretFields) mpPayload[name] = data.get(name);

    try {
      await apiRequest("/api/me/mercadopago-settings", {
        method: "PUT",
        token: options.token,
        body: JSON.stringify(mpPayload)
      });
      await apiRequest("/api/me/billing-settings/boleto", {
        method: "PUT",
        token: options.token,
        body: JSON.stringify({
          boletoEnabled: mpPayload.mercadopagoBoletoEnabled,
          boletoFeeMode: data.get("boletoFeeMode"),
          boletoFeeAmount: Number(data.get("boletoFeeAmount") || 0),
          boletoDueDays: Number(data.get("boletoDueDays") || 3),
          boletoInstructions: data.get("boletoInstructions")
        })
      });
      setFeedback("Configurações salvas com segurança.");
    } catch (error) {
      setFeedback(error.message, true);
    }
  });
}
