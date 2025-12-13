module.exports = (db, admin) => {
  const router = require("express").Router();
  const orders = db.collection("orders");
  const products = db.collection("products");
  const users = db.collection("users");

  const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const dbUser = await users.findOne({ email: decoded.email });

    if (dbUser?.role !== "manager") {
      return res.status(403).send({ error: "Manager only" });
    }

    req.user = dbUser;
    next();
  };

  router.get("/stats", verifyToken, async (req, res) => {
    const email = req.user.email;

    const myProducts = await products.countDocuments({ managerEmail: email });
    const pending = await orders.countDocuments({ status: "Pending" });
    const approved = await orders.countDocuments({ status: "Approved" });
    const totalOrders = await orders.countDocuments();

    res.send({
      products: myProducts,
      pending,
      approved,
      totalOrders,
    });
  });

  return router;
};
