// routes/manager.js
const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = (db, admin) => {
  const router = express.Router();
  const orders = db.collection("orders");
  const products = db.collection("products");
  const users = db.collection("users");

  // =======================
  // Verify Manager JWT
  // =======================
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

  // =======================
  // Manager Dashboard Stats
  // =======================
  router.get("/stats", verifyToken, async (req, res) => {
    try {
      const productsCount = await products.countDocuments({ createdBy: req.user.email });
      const pendingCount = await orders.countDocuments({ status: "Pending" });
      const approvedCount = await orders.countDocuments({ status: "Approved" });
      const totalOrdersCount = await orders.countDocuments({});

      res.send({
        products: productsCount,
        pending: pendingCount,
        approved: approvedCount,
        totalOrders: totalOrdersCount,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch stats" });
    }
  });

  // =======================
  // Pending Orders
  // =======================
  router.get("/pending-orders", verifyToken, async (req, res) => {
    try {
      const pendingOrders = await orders
        .find({ status: "Pending" })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(pendingOrders);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch pending orders" });
    }
  });

  // =======================
  // Approved Orders
  // =======================
  router.get("/approved-orders", verifyToken, async (req, res) => {
    try {
      const approvedOrders = await orders
        .find({ status: "Approved" })
        .sort({ approvedAt: -1 })
        .toArray();
      res.send(approvedOrders);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch approved orders" });
    }
  });

  // =======================
  // Approve Order
  // =======================
  router.patch("/orders/:id/approve", verifyToken, async (req, res) => {
    try {
      const orderId = req.params.id;
      await orders.updateOne(
        { _id: new ObjectId(orderId) },
        { $set: { status: "Approved", approvedAt: new Date() } }
      );
      res.send({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to approve order" });
    }
  });

  // =======================
  // Reject Order
  // =======================
  router.patch("/orders/:id/reject", verifyToken, async (req, res) => {
    try {
      const orderId = req.params.id;
      await orders.updateOne(
        { _id: new ObjectId(orderId) },
        { $set: { status: "Rejected", rejectedAt: new Date() } }
      );
      res.send({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to reject order" });
    }
  });

  return router;
};
