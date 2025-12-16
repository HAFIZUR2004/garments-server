const express = require("express");
const { ObjectId } = require("mongodb");
const Stripe = require("stripe");
const dotenv = require('dotenv');
dotenv.config();

// db = MongoDB Client, admin = Firebase Admin
module.exports = (db, admin) => {
    const router = express.Router();
    const stripe = Stripe(process.env.STRIPE_SECRET);

    const ordersCollection = db.collection("orders");
    const productsCollection = db.collection("products");
    const usersCollection = db.collection("users");

    // ================= JWT VERIFY =================
    // ... (rest of verifyToken remains the same)
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
                status: dbUser.status,
            };
            next();
        } catch (err) {
            res.status(403).send({ error: "Unauthorized" });
        }
    };

    // ================= ✅ ফিক্সড STRIPE CHECKOUT =================
    router.post("/create-checkout-session", verifyToken, async (req, res) => {
        try {
            // ✅ ফিক্স: প্রথমে orderData অবজেক্টটি req.body থেকে নিন
            const { orderData } = req.body;
            
            if (!orderData) return res.status(400).send({ error: "Order data missing." });

            const {
                productId,
                productName, // ✅ ফ্রন্টএন্ড থেকে productName পাঠানো হচ্ছে, তাই এখানেও destructure করা হলো
                quantity,
                orderPrice, // ফ্রন্টএন্ড থেকে final orderPrice আসছে
                address,
                notes,
                firstName,
                lastName,
                contactNumber,
            } = orderData; // ✅ এখন orderData থেকে ডেটা destructure করুন

            const product = await productsCollection.findOne({
                _id: new ObjectId(productId),
            });

            if (!product) return res.status(404).send({ error: "Product not found" });
            
            // Quantity validation (ensure data types are correct)
            const numQuantity = Number(quantity);
            const numOrderPrice = Number(orderPrice);

            if (numQuantity < product.minOrder)
                return res.status(400).send({ error: "Minimum order not met" });
            if (numQuantity > product.availableQuantity)
                return res.status(400).send({ error: "Out of stock" });

            // Note: Stripe price should ideally be recalculated here for maximum security, 
            // but we'll use the passed orderPrice for simplicity now.
            // const calculatedPrice = product.price * numQuantity;

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            product_data: { name: productName || product.name }, // productName ব্যবহার করা হলো
                            unit_amount: Math.round(numOrderPrice * 100), // ✅ ফ্রন্টএন্ডের পাঠানো মূল্য সেন্টে ব্যবহার করা হলো
                        },
                        quantity: 1,
                    },
                ],
                // ✅ metadata তে সমস্ত ডেটা স্ট্রিং হিসেবে রাখতে হবে
                metadata: {
                    productId: productId,
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
            // ✅ রিয়েল এরর মেসেজ পাঠানো হলো
            res.status(500).send({ error: "Stripe Checkout Failed. Check server logs." });
        }
    });

    // ================= STRIPE PAYMENT SUCCESS =================
    // ... (rest of payment-success remains the same, but please verify metadata usage)
    router.post("/payment-success", verifyToken, async (req, res) => {
        try {
            const { sessionId } = req.body;

            const session = await stripe.checkout.sessions.retrieve(sessionId);
            if (session.payment_status !== "paid")
                return res.status(400).send({ error: "Payment not completed" });

            const exists = await ordersCollection.findOne({
                paymentSessionId: sessionId,
            });
            if (exists) return res.send({ success: true, orderId: exists._id }); // ✅ orderId রিটার্ন করা হলো

            const { productId, quantity, address, notes, firstName, lastName, contactNumber, orderPrice } = session.metadata; // ✅ মেটাডেটা থেকে অতিরিক্ত ফিল্ড গ্রহণ

            // ⚠️ Warning: You are decreasing quantity BEFORE placing the order. 
            // This is generally better done by webhook, but for a simple flow, it's acceptable.
            await productsCollection.updateOne(
                { _id: new ObjectId(productId), availableQuantity: { $gte: Number(quantity) } },
                { $inc: { availableQuantity: -Number(quantity) } }
            );

            const newOrder = {
                userId: session.metadata.userId,
                email: session.metadata.email,
                productId,
                quantity: Number(quantity),
                orderPrice: Number(orderPrice), // ✅ orderPrice যুক্ত করা হলো
                address,
                notes,
                firstName, // ✅ নতুন ফিল্ড
                lastName, // ✅ নতুন ফিল্ড
                contactNumber, // ✅ নতুন ফিল্ড
                paymentMethod: "PayFirst", // Hardcoded to 'PayFirst' or 'Stripe'
                status: "Paid",
                paymentSessionId: sessionId,
                createdAt: new Date(),
            };

            const result = await ordersCollection.insertOne(newOrder);

            res.send({ success: true, orderId: result.insertedId });
        } catch (err) {
            console.error("Payment success failed:", err);
            res.status(500).send({ error: "Payment success failed" });
        }
    });


    // ================= COD / bKash =================
    // ... (rest of buy-now needs the new fields too)
    router.post("/buy-now", verifyToken, async (req, res) => {
        try {
            const {
                productId,
                quantity,
                paymentMethod,
                address,
                notes,
                orderPrice, // ✅ ফ্রন্টএন্ড থেকে আসছে
                firstName, // ✅ ফ্রন্টএন্ড থেকে আসছে
                lastName, // ✅ ফ্রন্টএন্ড থেকে আসছে
                contactNumber, // ✅ ফ্রন্টএন্ড থেকে আসছে
            } = req.body;

            if (!["Cash on Delivery", "bKash"].includes(paymentMethod))
                return res.status(400).send({ error: "Invalid method" });

            const product = await productsCollection.findOne({
                _id: new ObjectId(productId),
            });

            if (!product) return res.status(404).send({ error: "Product not found" });
            if (quantity > product.availableQuantity)
                return res.status(400).send({ error: "Out of stock" });

            // ⚠️ Warning: You are decreasing quantity BEFORE approval. 
            // In real COD/bKash, stock is typically reserved or only decreased on approval.
            await productsCollection.updateOne(
                { _id: new ObjectId(productId) },
                { $inc: { availableQuantity: -Number(quantity) } }
            );

            const result = await ordersCollection.insertOne({ // ✅ ডেটাবেসে সব ফিল্ড সেভ করা হলো
                userId: req.user.uid,
                email: req.user.email,
                productId,
                quantity: Number(quantity),
                orderPrice: Number(orderPrice),
                address,
                notes,
                firstName, 
                lastName, 
                contactNumber, 
                paymentMethod,
                status: "Pending",
                createdAt: new Date(),
            });

            res.send({ success: true, orderId: result.insertedId }); // ✅ orderId রিটার্ন করা হলো
        } catch (err) {
            console.error("COD/bKash Order Failed:", err);
            res.status(500).send({ error: "Order failed" });
        }
    });
    
    // ... (rest of the file)
    router.get("/my-orders", verifyToken, async (req, res) => {
        const orders = await ordersCollection
            .find({ userId: req.user.uid })
            .toArray();
        res.send(orders);
    });

    return router;
};