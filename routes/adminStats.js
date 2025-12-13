module.exports = (db, admin) => {
  const router = require("express").Router();
  const users = db.collection("users");
  const products = db.collection("products");
  const orders = db.collection("orders");

  const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).send({ error: "No token" });

    const decoded = await admin.auth().verifyIdToken(token);
    const dbUser = await users.findOne({ email: decoded.email });

    if (dbUser?.role !== "admin") {
      return res.status(403).send({ error: "Admin only" });
    }

    req.user = dbUser;
    next();
  };

  router.get("/stats", verifyToken, async (req, res) => {
    const totalUsers = await users.countDocuments();
    const totalManagers = await users.countDocuments({ role: "manager" });
    const totalProducts = await products.countDocuments();
    const totalOrders = await orders.countDocuments();

    res.send({
      users: totalUsers,
      managers: totalManagers,
      products: totalProducts,
      orders: totalOrders,
    });
  });

  return router;
};
