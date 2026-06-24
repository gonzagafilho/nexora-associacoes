const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../../config/env");
const User = require("../../models/User");
const Tenant = require("../../models/Tenant");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "E-mail e senha são obrigatórios." });
    }

    const user = await User.findOne({
      email: String(email).toLowerCase(),
      status: "active"
    }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({ ok: false, message: "Credenciais inválidas." });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      return res.status(401).json({ ok: false, message: "Credenciais inválidas." });
    }

    const tenant = await Tenant.findById(user.tenantId);

    if (!tenant || tenant.status !== "active") {
      return res.status(403).json({ ok: false, message: "Associação inativa ou bloqueada." });
    }

    const token = jwt.sign(
      { sub: String(user._id), tenantId: String(user.tenantId), role: user.role, email: user.email },
      jwtSecret,
      { expiresIn: "12h" }
    );

    return res.json({
      ok: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        status: tenant.status,
        enabledModules: Array.isArray(tenant.enabledModules) ? tenant.enabledModules : []
      }
    });
  } catch (error) {
    console.error("[auth.login]", error);
    return res.status(500).json({ ok: false, message: "Erro interno no login." });
  }
});

module.exports = router;
