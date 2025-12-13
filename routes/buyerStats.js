module.exports = (db, admin) => {
  const router = require("express").Router();
  const orders = db.collection("orders");
  const users = db.collection("users");

  const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const dbUser = await users.findOne({ email: decoded.email });

    req.user = dbUser;
    next();
  };

  router.get("/stats", verifyToken, async (req, res) => {
    const email = req.user.email;

    const total = await orders.countDocuments({ email });
    const pending = await orders.countDocuments({ email, status: "Pending" });
    const approved = await orders.countDocuments({ email, status: "Approved" });
    const rejected = await orders.countDocuments({ email, status: "Rejected" });

    res.send({ total, pending, approved, rejected });
  });

  return router;
};
