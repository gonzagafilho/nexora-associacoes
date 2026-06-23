module.exports = {
  apps: [
    {
      name: "nexora-associacoes-api",
      cwd: "/home/servidor-dcnet/apps/associacao-bolepix/backend",
      script: "src/server.js",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
