// routes/manager.js
const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = (db, admin) => {
  const router = express.Router();
  const orders = db.collection("orders");
  const users = db.collection("users");

  // Verify manager token
  const verifyToken = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).send({ error: "No token" });

      const decoded = await admin.auth().verifyIdToken(token);
      const dbUser = await users.findOne({ email: decoded.email });
      if (!dbUser || dbUser.role !== "manager") {
        return res.status(403).send({ error: "Manager only" });
      }

      req.user = dbUser;
      next();
    } catch (err) {
      console.error(err);
      res.status(403).send({ error: "Invalid token" });
    }
  };

  // Get Pending Orders
  router.get("/pending-orders", verifyToken, async (req, res) => {
    const pendingOrders = await orders
      .find({ status: "Pending" })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(pendingOrders);
  });

  // Get Approved Orders
  router.get("/approved-orders", verifyToken, async (req, res) => {
    const approvedOrders = await orders
      .find({ status: "Approved" })
      .sort({ approvedAt: -1 })
      .toArray();
    res.send(approvedOrders);
  });

  // Approve Order
  router.patch("/orders/:id/approve", verifyToken, async (req, res) => {
    const orderId = req.params.id;
    const result = await orders.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status: "Approved", approvedAt: new Date() } }
    );
    res.send({ success: true });
  });

  // Reject Order
  router.patch("/orders/:id/reject", verifyToken, async (req, res) => {
    const orderId = req.params.id;
    const result = await orders.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status: "Rejected", rejectedAt: new Date() } }
    );
    res.send({ success: true });
  });

  return router;
};
