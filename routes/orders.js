// src/routes/orders.js
const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = (db, admin) => {
  const router = express.Router();
  const orders = db.collection("orders");
  const users = db.collection("users");

  // ==========================
  // 🔐 Verify Token Middleware
  // ==========================
  const verifyToken = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).send({ error: "No token provided" });
      }

      const token = authHeader.split(" ")[1];
      const decoded = await admin.auth().verifyIdToken(token);

      // 🔥 FIXED: email দিয়ে user খুঁজবো
      let dbUser = await users.findOne({ email: decoded.email });

      // যদি user না পাই → তৈরি করে দেবো
      if (!dbUser) {
        const newUser = {
          userId: decoded.uid,
          email: decoded.email,
          name: decoded.name || "",
          role: "user",
          status: "active",
          createdAt: new Date(),
        };

        const result = await users.insertOne(newUser);
        dbUser = { ...newUser, _id: result.insertedId };
      }

      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        role: dbUser.role,
      };

      next();
    } catch (err) {
      console.error("TOKEN ERROR:", err);
      res.status(403).send({ error: "Invalid or expired token" });
    }
  };

  // ==========================
  // 🛒 Place Order
  // ==========================
  router.post("/book", verifyToken, async (req, res) => {
    const { productId, quantity, orderPrice, productName } = req.body;

    if (!productId || !quantity || !orderPrice) {
      return res.status(400).send({ error: "Missing fields" });
    }

    const order = {
      userId: req.user.uid,
      email: req.user.email,
      productId,
      productName,
      quantity,
      orderPrice,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await orders.insertOne(order);
    res.send({ success: true, orderId: result.insertedId });
  });

  // ==========================
  // 👑 Admin: Get ALL Orders
  // ==========================
  router.get("/", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).send({ error: "Admin only" });
    }

    const allOrders = await orders.find({}).sort({ createdAt: -1 }).toArray();
    res.send(allOrders);
  });

  // ==========================
  // 👤 User: My Orders
  // ==========================
  router.get("/my-orders/:uid", verifyToken, async (req, res) => {
    const userOrders = await orders
      .find({ userId: req.params.uid })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(userOrders);
  });
  // ==========================
  // 📦 Track Order (User + Admin)
  // ==========================
  router.get("/track/:id", verifyToken, async (req, res) => {
    try {
      const orderId = req.params.id;

      const order = await orders.findOne({ _id: new ObjectId(orderId) });

      if (!order) {
        return res.status(404).send({ error: "Order not found" });
      }

      // যদি trackingSteps না থাকে → ডিফল্ট বানিয়ে দিচ্ছি
      if (!order.trackingSteps) {
        order.trackingSteps = [
          {
            title: "Order Placed",
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            location: "Online Store",
            notes: "Your order has been successfully placed.",
          },
        ];

        await orders.updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { trackingSteps: order.trackingSteps } }
        );
      }

      res.send(order);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to track order" });
    }
  });
  // ==========================
  // 🔄 Admin: Update Tracking Steps
  // ==========================
  router.patch("/track/:orderId", verifyToken, async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).send({ error: "Admin only" });
    }

    const { trackingSteps, currentLocation } = req.body;

    if (!trackingSteps || !Array.isArray(trackingSteps)) {
      return res.status(400).send({ error: "trackingSteps must be an array" });
    }

    await orders.updateOne(
      { _id: new ObjectId(req.params.orderId) },
      { $set: { trackingSteps, currentLocation: currentLocation || null } }
    );

    res.send({ success: true });
  });


  // ==========================
  // ❌ Cancel Order
  // ==========================
  router.patch("/cancel/:id", verifyToken, async (req, res) => {
    await orders.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: "Cancelled" } }
    );
    res.send({ success: true });
  });

  return router;
};
