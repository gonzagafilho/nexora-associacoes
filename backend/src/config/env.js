require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT || 3060),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/associacao_bolepix",
  jwtSecret: process.env.JWT_SECRET || "dev_secret_change_me",
  appName: process.env.APP_NAME || "Associacao BolePix"
};
