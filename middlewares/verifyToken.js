// server/middlewares/verifyToken.js
const admin = require("../config/firebaseAdmin");
const { users } = require("../db"); // import your db or pass it as param

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).send({ error: "No token" });

    const decoded = await admin.auth().verifyIdToken(token);
    const dbUser = await users.findOne({ email: decoded.email });
    if (!dbUser) return res.status(403).send({ error: "User not found" });

    req.user = { uid: decoded.uid, email: decoded.email, role: dbUser.role };
    next();
  } catch (err) {
    console.error(err);
    res.status(403).send({ error: "Invalid token" });
  }
};

module.exports = verifyToken;
