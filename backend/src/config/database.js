const mongoose = require("mongoose");
const { mongoUri } = require("./env");

async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  console.log("[database] MongoDB conectado");
}

module.exports = { connectDatabase };
