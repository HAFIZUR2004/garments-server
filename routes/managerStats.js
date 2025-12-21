const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = (db, admin) => {
  const router = express.Router();
  const orders = db.collection("orders");
  const products = db.collection("products");
  const users = db.collection("users");

  // Token verification middleware
  const verifyToken = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).send({ error: "No token" });

      const decoded = await admin.auth().verifyIdToken(token);
      const dbUser = await users.findOne({ email: decoded.email });
      
      if (!dbUser || (dbUser.role !== "manager" && dbUser.role !== "admin")) {
        return res.status(403).send({ error: "Access denied" });
      }

      req.user = dbUser; // req.user.email পাওয়া যাবে
      next();
    } catch (err) {
      res.status(403).send({ error: "Invalid token" });
    }
  };

  // Dashboard Stats
  router.get("/stats", verifyToken, async (req, res) => {
    try {
      const managerEmail = req.user.email;

      const productsCount = await products.countDocuments({ createdBy: managerEmail });
      const pendingCount = await orders.countDocuments({ sellerEmail: managerEmail, status: "Pending" });
      const approvedCount = await orders.countDocuments({ sellerEmail: managerEmail, status: "Approved" });
      const totalOrdersCount = await orders.countDocuments({ sellerEmail: managerEmail });

      res.send({
        products: productsCount,
        pending: pendingCount,
        approved: approvedCount,
        totalOrders: totalOrdersCount,
      });
    } catch (err) {
      res.status(500).send({ error: "Failed to fetch stats" });
    }
  });

  // Pending Orders
  router.get("/pending-orders", verifyToken, async (req, res) => {
    try {
      const pendingOrders = await orders
        .find({ sellerEmail: req.user.email, status: "Pending" })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(pendingOrders);
    } catch (err) {
      res.status(500).send({ error: "Failed to fetch pending orders" });
    }
  });

  // Approved Orders
  router.get("/approved-orders", verifyToken, async (req, res) => {
    try {
      const approvedOrders = await orders
        .find({ sellerEmail: req.user.email, status: "Approved" })
        .sort({ approvedAt: -1 })
        .toArray();
      res.send(approvedOrders);
    } catch (err) {
      res.status(500).send({ error: "Failed to fetch approved orders" });
    }
  });

  // Approve Order
  router.patch("/orders/:id/approve", verifyToken, async (req, res) => {
    try {
      await orders.updateOne(
        { _id: new ObjectId(req.params.id), sellerEmail: req.user.email },
        { $set: { status: "Approved", approvedAt: new Date() } }
      );
      res.send({ success: true });
    } catch (err) {
      res.status(500).send({ error: "Failed to approve order" });
    }
  });

  return router;
};
// manager stats
