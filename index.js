// index.js 
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const admin = require("./config/firebaseAdmin"); 

const app = express();
const port = process.env.PORT || 5000;

// --- Middleware ---
app.use(express.json());
app.use(
    cors({
        origin: process.env.FRONTEND_URL, 
        credentials: true,
    })
);

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.o1btdpz.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1 },
});

async function run() {
    try {
        await client.connect();
        console.log("✅ MongoDB connected successfully.");

        const db = client.db(process.env.DB_NAME);

        // ================= ROUTES =================
        app.use("/api/users", require("./routes/users")(db, admin)); 

        // অন্যান্য রুট:
        app.use("/api/products", require("./routes/products")(db));
        app.use("/api/orders", require("./routes/orders")(db, admin)); 
        app.use("/api/admin", require("./routes/adminStats")(db, admin));
        app.use("/api/manager", require("./routes/managerStats")(db, admin));
        app.use("/api/buyer", require("./routes/buyerStats")(db, admin));

        // Start server **after DB connected**
        app.listen(port, () => {
            console.log(`🚀 Server running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error("❌ Server initialization error:", error);
    }
}

run();

// Health check
app.get("/", (req, res) => {
    res.send("✅ Garments Server Running");
});