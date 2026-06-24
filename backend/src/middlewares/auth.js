const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, message: "Token não informado." });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);

    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email
    };

    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, message: "Token inválido ou expirado." });
  }
}

module.exports = auth;
