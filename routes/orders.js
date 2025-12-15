// routes/orders.js
const { ObjectId } = require("mongodb");

module.exports = (db, admin) => {
  const stripe = require("stripe")(process.env.STRIPE_SECRET);

  const router = require("express").Router();
  const ordersCollection = db.collection("orders");
  const productsCollection = db.collection("products");
  const usersCollection = db.collection("users");

  // ================= JWT Verify =================
  const verifyToken = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).send({ error: "No token provided" });

      const decoded = await admin.auth().verifyIdToken(token);
      const dbUser = await usersCollection.findOne({ email: decoded.email });
      if (!dbUser) return res.status(403).send({ error: "User not found" });

      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        role: dbUser.role,
        status: dbUser.status,
      };

      next();
    } catch (err) {
      console.error(err);
      res.status(403).send({ error: "Unauthorized" });
    }
  };

  // ================= STRIPE PAYFIRST =================
  router.post("/create-checkout-session", verifyToken, async (req, res) => {
    try {
      if (req.user.status === "suspended") {
        return res.status(403).send({ error: "Account suspended" });
      }

      const { orderData } = req.body;
      const {
        productId,
        productName,
        quantity,
        orderPrice,
        address,
        notes,
        paymentMethod,
        firstName,
        lastName,
        contactNumber,
      } = orderData;

      if (paymentMethod !== "PayFirst") {
        return res.status(400).send({ error: "Invalid payment method" });
      }

      const product = await productsCollection.findOne({
        _id: new ObjectId(productId),
      });

      if (!product) return res.status(404).send({ error: "Product not found" });
      if (quantity < product.minOrder)
        return res.status(400).send({ error: "Below minimum order quantity" });
      if (quantity > product.availableQuantity)
        return res.status(400).send({ error: "Insufficient stock" });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: productName,
                description: `Quantity: ${quantity}`,
              },
              unit_amount: Math.round(orderPrice * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: req.user.uid,
          email: req.user.email,
          productId,
          quantity: String(quantity),
          paymentMethod,
          address,
          firstName,
          lastName,
          contactNumber,
          notes: notes || "",
        },
        success_url: `${process.env.FRONTEND_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/my-orders`,
      });

      res.send({ url: session.url });
    } catch (err) {
      console.error("Stripe Error:", err);
      res.status(500).send({ error: "Stripe session failed" });
    }
  });

  // ================= STRIPE PAYMENT SUCCESS =================
  router.post("/payment-success", verifyToken, async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).send({ error: "Missing sessionId" });

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        return res.status(400).send({ error: "Payment not completed" });
      }

      if (session.metadata.email !== req.user.email) {
        return res.status(403).send({ error: "User mismatch" });
      }

      const existingOrder = await ordersCollection.findOne({
        paymentSessionId: sessionId,
      });
      if (existingOrder) {
        return res.send({ success: true, orderId: existingOrder._id });
      }

      const {
        productId,
        quantity,
        paymentMethod,
        address,
        firstName,
        lastName,
        contactNumber,
        notes,
      } = session.metadata;

      const product = await productsCollection.findOne({
        _id: new ObjectId(productId),
      });

      if (!product) return res.status(404).send({ error: "Product not found" });

      if (Number(quantity) > product.availableQuantity) {
        return res.status(400).send({ error: "Stock unavailable" });
      }

      const orderPrice = session.amount_total / 100;

      const newOrder = {
        userId: req.user.uid,
        email: req.user.email,
        productId,
        productName: product.name,
        quantity: Number(quantity),
        orderPrice,
        firstName,
        lastName,
        contactNumber,
        address,
        notes: notes || "Paid via Stripe",
        paymentMethod,
        status: "Pending",
        createdAt: new Date(),
        paymentSessionId: sessionId,
        paidAt: new Date(),
      };

      await ordersCollection.insertOne(newOrder);

      // ✅ STOCK UPDATE
      await productsCollection.updateOne(
        { _id: new ObjectId(productId) },
        { $inc: { availableQuantity: -Number(quantity) } }
      );

      res.send({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Payment success failed" });
    }
  });

  // ================= COD / bKash =================
  router.post("/buy-now", verifyToken, async (req, res) => {
    try {
      if (req.user.status === "suspended") {
        return res.status(403).send({ error: "Account suspended" });
      }

      const {
        productId,
        productName,
        quantity,
        orderPrice,
        address,
        notes,
        paymentMethod,
        firstName,
        lastName,
        contactNumber,
      } = req.body;

      if (!["Cash on Delivery", "bKash"].includes(paymentMethod)) {
        return res.status(400).send({ error: "Invalid payment method" });
      }

      const product = await productsCollection.findOne({
        _id: new ObjectId(productId),
      });

      if (!product) return res.status(404).send({ error: "Product not found" });
      if (quantity < product.minOrder)
        return res.status(400).send({ error: "Below minimum order quantity" });
      if (quantity > product.availableQuantity)
        return res.status(400).send({ error: "Insufficient stock" });

      await ordersCollection.insertOne({
        userId: req.user.uid,
        email: req.user.email,
        productId,
        productName,
        quantity: Number(quantity),
        orderPrice: Number(orderPrice),
        firstName,
        lastName,
        contactNumber,
        address,
        notes: notes || "",
        paymentMethod,
        status: "Pending",
        createdAt: new Date(),
      });

      // ✅ STOCK UPDATE
      await productsCollection.updateOne(
        { _id: new ObjectId(productId) },
        { $inc: { availableQuantity: -Number(quantity) } }
      );

      res.send({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Order failed" });
    }
  });

  // ================= MY ORDERS =================
  router.get("/my-orders", verifyToken, async (req, res) => {
    try {
      const orders = await ordersCollection
        .find({ userId: req.user.uid })
        .toArray();
      res.send(orders);
    } catch (err) {
      res.status(500).send({ error: "Failed to fetch orders" });
    }
  });

  return router;
};
