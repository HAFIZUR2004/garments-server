const express = require("express");
const { ObjectId } = require("mongodb");
const Stripe = require("stripe");
const dotenv = require('dotenv');
dotenv.config();

// মডিউল এক্সপোর্ট করা
module.exports = (db, admin) => {
    const router = express.Router();
    const stripe = Stripe(process.env.STRIPE_SECRET);

    const ordersCollection = db.collection("orders");
    const productsCollection = db.collection("products");
    const usersCollection = db.collection("users");

    // ================= JWT VERIFY (Middleware) =================
    const verifyToken = async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(" ")[1];
            if (!token) return res.status(401).send({ error: "No token" });

            const decoded = await admin.auth().verifyIdToken(token);
            const dbUser = await usersCollection.findOne({ email: decoded.email });

            if (!dbUser) return res.status(403).send({ error: "User not found" });

            req.user = {
                uid: decoded.uid,
                email: decoded.email,
                role: dbUser.role,
                status: dbUser.status
            };

            next();
        } catch (err) {
            console.error("Token verification failed:", err.message);
            res.status(403).send({ error: "Unauthorized" });
        }
    };
    // ================= CHECK BUYER SUSPEND (Middleware) =================
const checkBuyerSuspend = (req, res, next) => {
    if (req.user.role === "buyer" && req.user.status === "suspended") {
        return res.status(403).json({
            message: "Account suspended. You cannot place new orders.",
        });
    }
    next();
};


//     router.post("/", verifyToken, checkBuyerSuspend, async (req, res) => {
//   // create order logic
// });

// const checkBuyerSuspend = (req, res, next) => {
//   if (req.user.role === "buyer" && req.user.status === "suspended") {
//     return res.status(403).json({
//       message: "Account suspended. You cannot place new orders.",
//     });
//   }
//   next();
// };
    // ================= ORDERS ROUTES =================

    // 1. GET ALL ORDERS (ADMIN/MANAGER ONLY)
    router.get("/all", verifyToken, async (req, res) => {
        if (!["admin","manager"].includes(req.user.role))
            return res.status(403).send({ error: "Access denied." });
        try {
            const orders = await ordersCollection.find({}).sort({ createdAt: -1 }).toArray();
            res.send(orders);
        } catch (error) {
            res.status(500).send({ error: "Server error" });
        }
    });

    // 2. UPDATE ORDER STATUS
    router.patch("/update-status/:id", verifyToken, async (req, res) => {
        if (!["admin","manager"].includes(req.user.role))
            return res.status(403).send({ error: "Access denied." });

        const { id } = req.params;
        const { status: newStatus } = req.body;

        try {
            await ordersCollection.updateOne(
                { _id: new ObjectId(id) },
                { 
                    $set: { status: newStatus },
                    $push: {
                        trackingSteps: {
                            status: newStatus,
                            location: "Updated by Staff",
                            date: new Date(),
                            notes: `Order status changed to ${newStatus}.`
                        }
                    }
                }
            );
            res.send({ success: true });
        } catch (error) {
            res.status(500).send({ error: "Update failed" });
        }
    });

    // 3. TRACK ORDER BY ID
  router.get("/track/:orderId", verifyToken, async (req, res) => {
    try {
      const order = await ordersCollection.findOne({
        _id: new ObjectId(req.params.orderId),
        userId: req.user.uid
      });

      if (!order) {
        return res.status(404).send({ message: "Order not found" });
      }

      res.send(order);
    } catch (err) {
      res.status(500).send({ error: "Server error" });
    }
  });


    // 4. STRIPE CHECKOUT
    router.post("/create-checkout-session", verifyToken, async (req, res) => {
        try {
            const { orderData } = req.body;
            if (!orderData) return res.status(400).send({ error: "Order data missing." });

            const {
                productId,
                productName,
                quantity,
                orderPrice,
                address,
                notes,
                firstName,
                lastName,
                
                contactNumber,
            } = orderData;

            const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
            if (!product) return res.status(404).send({ error: "Product not found" });

            const numQuantity = Number(quantity);
            const numOrderPrice = Number(orderPrice);

            if (numQuantity < product.minOrder)
                return res.status(400).send({ error: "Minimum order not met" });
            if (numQuantity > product.availableQuantity)
                return res.status(400).send({ error: "Out of stock" });

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            product_data: { name: productName || product.name },
                            unit_amount: Math.round(numOrderPrice * 100),
                        },
                        quantity: 1,
                    },
                ],
                metadata: {
                    productId,
                    quantity: String(numQuantity),
                    orderPrice: String(numOrderPrice),
                    userId: req.user.uid,
                    email: req.user.email,
                    address: address || "",
                    notes: notes || "",
                    firstName: firstName || "",
                    lastName: lastName || "",
                    contactNumber: contactNumber || "",
                },
                success_url: `${process.env.FRONTEND_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/dashboard/my-orders?payment_status=cancelled`,
            });

            res.send({ url: session.url });
        } catch (err) {
            console.error("Stripe Checkout Error:", err);
            res.status(500).send({ error: "Stripe Checkout Failed. Check server logs." });
        }
    });

    // 5. STRIPE PAYMENT SUCCESS
  // 5. STRIPE PAYMENT SUCCESS (Updated)
router.post("/payment-success", verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).send({ error: "Session ID missing." });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        console.log("Stripe Session:", session); // Debug

        if (session.payment_status !== "paid")
            return res.status(400).send({ error: "Payment not completed" });

        // Check if order already exists
        const exists = await ordersCollection.findOne({ paymentSessionId: sessionId });
        if (exists) return res.send({ success: true, orderId: exists._id });

        // Destructure metadata safely
        const {
            productId,
            quantity,
            address,
            notes,
            firstName,
            lastName,
            contactNumber,
            orderPrice,
            sellerEmail // make sure frontend sends this
        } = session.metadata;

        // Update product availableQuantity
        await productsCollection.updateOne(
            { _id: new ObjectId(productId), availableQuantity: { $gte: Number(quantity) } },
            { $inc: { availableQuantity: -Number(quantity) } }
        );

        // Insert new order
        const newOrder = {
            userId: session.metadata.userId,
            email: session.metadata.email,
            productId,
            quantity: Number(quantity),
            orderPrice: Number(orderPrice),
            address,
            notes,
            firstName,
            lastName,
            sellerEmail: sellerEmail || "default@example.com", // fallback
            contactNumber,
            paymentMethod: "PayFirst",
            status: "Paid",
            paymentSessionId: sessionId,
            createdAt: new Date(),
        };

        const result = await ordersCollection.insertOne(newOrder);

        res.send({ success: true, orderId: result.insertedId });
    } catch (err) {
        console.error("Payment success failed:", err.message);
        res.status(500).send({ error: err.message });
    }
});

    // 6. COD / bKash ORDER
    router.post("/buy-now", verifyToken, async (req, res) => {
        try {
            const {
                productId,
                quantity,
                sellerEmail,
                paymentMethod,
                address,
                notes,
                orderPrice,
                firstName,
                lastName,
                
                contactNumber,
                
            } = req.body;

            if (!["Cash on Delivery", "bKash"].includes(paymentMethod))
                return res.status(400).send({ error: "Invalid method" });

            const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
            if (!product) return res.status(404).send({ error: "Product not found" });
            if (quantity > product.availableQuantity)
                return res.status(400).send({ error: "Out of stock" });

            await productsCollection.updateOne(
                { _id: new ObjectId(productId) },
                { $inc: { availableQuantity: -Number(quantity) } }
            );

            const result = await ordersCollection.insertOne({
                userId: req.user.uid,
                email: req.user.email,
                productId,
                quantity: Number(quantity),
                orderPrice: Number(orderPrice),
                address,
                notes,
                firstName,
                lastName,
                sellerEmail,
                contactNumber,
                paymentMethod,
                status: "Pending",
                createdAt: new Date(),
            });

            res.send({ success: true, orderId: result.insertedId });
        } catch (err) {
            console.error("COD/bKash Order Failed:", err);
            res.status(500).send({ error: "Order failed" });
        }
    });

    // 7. GET MY ORDERS
    router.get("/my-orders", verifyToken, async (req, res) => {
        try {
            const orders = await ordersCollection.find({ userId: req.user.uid }).sort({ createdAt: -1 }).toArray();
            res.send(orders);
        } catch (error) {
            res.status(500).send({ error: "Error" });
        }
    });

    // 8. CANCEL ORDER
    router.patch("/cancel/:id", verifyToken, async (req, res) => {
        const { id } = req.params;
        try {
            const result = await ordersCollection.updateOne(
                { _id: new ObjectId(id), userId: req.user.uid, status: "Pending" },
                { $set: { status: "Cancelled" } }
            );
            res.send({ success: true });
        } catch (error) {
            res.status(500).send({ error: "Error" });
        }
    });

    // 9. MANAGER PENDING ORDERS
    router.get("/manager/pending-orders", verifyToken, async (req, res) => {
        if (!["manager","admin"].includes(req.user.role))
            return res.status(403).send({ error: "Access denied." });
        try {
            const query = { sellerEmail: req.user.email, status: "Pending" };
            const orders = await ordersCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(orders);
        } catch (error) {
            console.error(error);
            res.status(500).send({ error: "Failed to fetch pending orders" });
        }
    });

    // 10. MANAGER APPROVED ORDERS
    router.get("/manager/approved-orders", verifyToken, async (req, res) => {
        if (!["manager","admin"].includes(req.user.role))
            return res.status(403).send({ error: "Access denied." });
        try {
            const query = { sellerEmail: req.user.email, status: "Approved" };
            const orders = await ordersCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(orders);
        } catch (error) {
            res.status(500).send({ error: "Failed to fetch approved orders" });
        }
    });

    // 11. SELLER ORDERS
    router.get("/seller-orders", verifyToken, async (req, res) => {
        try {
            if (!["manager","admin"].includes(req.user.role))
                return res.status(403).send({ error: "Access denied" });

            const sellerEmail = req.user.email;
            const orders = await ordersCollection.find({ sellerEmail }).sort({ createdAt: -1 }).toArray();
            res.send(orders);
        } catch (error) {
            console.error("Seller orders fetch failed:", error);
            res.status(500).send({ error: "Failed to load seller orders" });
        }
    });

    return router; 
};

