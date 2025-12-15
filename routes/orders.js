// routes/orders.js (সংশোধিত)

const { ObjectId } = require("mongodb");
// ❌ এই লাইনটি মুছে ফেলা হলো বা কমেন্ট করা হলো: const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); 

module.exports = (db, admin) => {
  // ✅ Stripe ইনিশিয়ালাইজেশন এখানে করা হলো, STRIPE_SECRET ব্যবহার করে
  const stripe = require("stripe")(process.env.STRIPE_SECRET);

  const router = require("express").Router();
  const ordersCollection = db.collection("orders");
  const productsCollection = db.collection("products");
  const usersCollection = db.collection("users");

  // ================= JWT Verify Middleware =================
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
        name: dbUser.name,
        status: dbUser.status,
      };

      next();
    } catch (err) {
      console.error("JWT Verification Error:", err);
      res.status(403).send({ error: "Unauthorized" });
    }
  };

  // ================= 🎯 Stripe Checkout Session তৈরি =================
  router.post("/create-checkout-session", verifyToken, async (req, res) => {
    try {
      // Stripe ইনিশিয়ালাইজ না হলে ট্র্যাপিং
      if (!stripe) {
        return res.status(500).send({ error: "Payment gateway configuration error. Secret key missing." });
      }

      if (req.user.status === 'suspended') {
        return res.status(403).send({ error: "Your account is suspended. You cannot place new orders." });
      }

      const { orderData } = req.body;
      const { productId, productName, quantity, orderPrice, address, notes, paymentMethod } = orderData;

      const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
      if (!product) return res.status(404).send({ error: "Product not found" });
      if (quantity > product.availableQuantity) return res.status(400).send({ error: "Order quantity exceeds available stock" });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: productName,
                description: `Quantity: ${quantity}`,
              },
              // মূল্য সেন্ট-এ রূপান্তর (Stripe-এর প্রয়োজন)
              unit_amount: Math.round(orderPrice * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          userId: req.user.uid,
          email: req.user.email,
          productId: productId,
          quantity: String(quantity), // Stripe metadata string হিসেবে সংরক্ষণ করে
          paymentMethod: paymentMethod,
          address: address,
        },
        success_url: `${process.env.FRONTEND_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/my-orders?payment_status=cancelled`,
      });

      res.send({ url: session.url });

    } catch (err) {
      console.error("Stripe Checkout Error:", err);
      res.status(500).send({ error: "Failed to create checkout session" });
    }
  });

  // ================= 🎯 Payment Success (Final Order Placement) =================
  router.post("/payment-success", verifyToken, async (req, res) => {
    try {
      // Stripe ইনিশিয়ালাইজ না হলে ট্র্যাপিং
      if (!stripe) {
        return res.status(500).send({ error: "Payment gateway configuration error. Secret key missing." });
      }

      const { sessionId } = req.body;

      if (!sessionId) return res.status(400).send({ error: "Missing session ID" });

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        return res.status(400).send({ error: "Payment not completed" });
      }

      if (session.metadata.email !== req.user.email) {
        return res.status(403).send({ error: "User mismatch" });
      }

      const { userId, email, productId, quantity, paymentMethod, address } = session.metadata;
      const orderPrice = session.amount_total / 100;

      const productNameLineItem = session.line_items?.data[0]?.description;
      const productName = (productNameLineItem && productNameLineItem.includes('Quantity:'))
        ? productNameLineItem.split('Quantity: ')[0].trim()
        : 'Unknown Product (Check Metadata)';

      const existingOrder = await ordersCollection.findOne({ paymentSessionId: sessionId });
      if (existingOrder) {
        return res.send({ success: true, orderId: existingOrder._id });
      }

      const newOrder = {
        userId,
        email,
        productId,
        productName,
        quantity: Number(quantity),
        orderPrice: orderPrice,
        address,
        notes: "Online payment successful via PayFirst (Stripe Simulation)",
        paymentMethod,
        status: "Pending",
        createdAt: new Date(),
        paymentSessionId: sessionId,
        paidAt: new Date(),
      };

      const result = await ordersCollection.insertOne(newOrder);

      res.send({ success: true, orderId: result.insertedId });
    } catch (err) {
      console.error("Payment Success Order Placement Error:", err);
      res.status(500).send({ error: "Failed to process payment and place order" });
    }
  });

  // ================= Buy Now (COD-এর জন্য) =================
  router.post("/buy-now", verifyToken, async (req, res) => {
    try {
      if (req.user.status === 'suspended') {
        return res.status(403).send({ error: "Your account is suspended. You cannot place new orders." });
      }

      const { productId, productName, quantity, orderPrice, address, notes, paymentMethod } = req.body;
      if (paymentMethod !== "Cash on Delivery") {
        return res.status(400).send({ error: "Invalid payment method for this route. Use /create-checkout-session for PayFirst." });
      }

      const newOrder = {
        userId: req.user.uid,
        email: req.user.email,
        productId,
        productName,
        quantity: Number(quantity),
        orderPrice: Number(orderPrice),
        address,
        notes: notes || "",
        paymentMethod: paymentMethod,
        status: "Pending",
        createdAt: new Date(),
      };

      const result = await ordersCollection.insertOne(newOrder);
      res.send({ success: true, orderId: result.insertedId });

    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to place order" });
    }
  });
  // routes/orders.js (এই অংশটি সঠিক আছে)

  // ================= Get My Orders =================
  router.get("/my-orders", verifyToken, async (req, res) => { // ✅ এই রুটটি ফ্রন্টএন্ডে /api/orders/my-orders হিসেবে কল করা হয়েছে
    try {
      // টোকেন ভেরিফিকেশন থেকে পাওয়া UID ব্যবহার করে অর্ডার আনা হচ্ছে
      const myOrders = await ordersCollection.find({ userId: req.user.uid }).toArray();
      res.send(myOrders);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch orders" });
    }
  });

  // ... (বাকি কোড অপরিবর্তিত) ...
  // ================= Get My Orders =================
  router.get("/my-orders", verifyToken, async (req, res) => {
    try {
      const myOrders = await ordersCollection.find({ userId: req.user.uid }).toArray();
      res.send(myOrders);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch orders" });
    }
  });

  return router;
};