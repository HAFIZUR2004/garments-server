const { ObjectId } = require("mongodb");

module.exports = (db, admin) => {
  const router = require("express").Router();
  const orders = db.collection("orders");
  const users = db.collection("users");

  // Verify JWT
  const verifyToken = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).send({ error: "No token" });

      const token = authHeader.split(" ")[1];
      const decoded = await admin.auth().verifyIdToken(token);
      const dbUser = await users.findOne({ email: decoded.email });
      if (!dbUser) return res.status(403).send({ error: "User not found" });

      req.user = dbUser;
      next();
    } catch (err) {
      console.error(err);
      res.status(403).send({ error: "Unauthorized" });
    }
  };

  // Get my orders
  router.get("/my-orders/:uid", verifyToken, async (req, res) => {
    try {
      const userId = req.params.uid;
      const myOrders = await orders.find({ userId }).toArray();
      res.send(myOrders);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch orders" });
    }
  });
// Get all orders (admin only)
router.get("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).send({ error: "Forbidden: Admin only" });
    }
    const allOrders = await orders.find().toArray();
    res.send(allOrders);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch orders" });
  }
});

  // Cancel order
  router.patch("/cancel/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      await orders.updateOne(
        { _id: new ObjectId(id), userId: req.user.uid },
        { $set: { status: "Cancelled" } }
      );
      res.send({ message: "Order cancelled" });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to cancel order" });
    }
  });

  return router;
};
