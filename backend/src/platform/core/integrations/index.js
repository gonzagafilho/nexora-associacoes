function status() {
  return {
    mercadopago: "adapter-ready",
    webhooks: "adapter-ready",
    push: "adapter-ready"
  };
}

module.exports = {
  status
};
