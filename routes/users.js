// routes/users.js
const { ObjectId } = require("mongodb");

module.exports = (db, admin) => { 
    const router = require("express").Router();
    const usersCollection = db.collection("users");

    // --- Middleware for token verification ---
    const verifyToken = async (req, res, next) => {
        const authorization = req.headers.authorization;
        if (!authorization) {
            return res.status(401).send({ error: "Unauthorized access - No token" });
        }
        const token = authorization.split(" ")[1];

        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedToken.email; 
            next();
        } catch (error) {
            console.error("Token verification failed:", error.message);
            return res.status(401).send({ error: "Unauthorized access - Invalid token" });
        }
    };

    // ===============================================
    // 🚀 NEW ROUTE: UPDATE USER PROFILE (Requires Token)
    // ===============================================
    router.put("/update-profile", verifyToken, async (req, res) => {
        const userEmail = req.decodedEmail; // Middleware থেকে পাওয়া ইমেল
        const { name, phone, photoURL } = req.body;

        if (!userEmail) {
            return res.status(403).json({ success: false, error: "Access denied or Email missing" });
        }
        
        // আপডেটের জন্য ডেটা তৈরি করা
        const updateDoc = {
            $set: {
                name: name,
                phone: phone || null, 
                photoURL: photoURL || null, 
                updatedAt: new Date(),
            },
        };

        try {
            const result = await usersCollection.updateOne(
                { email: userEmail },
                updateDoc
            );
    
            if (result.matchedCount === 0) {
                return res.status(404).json({ success: false, error: "User not found in database" });
            }
    
            res.status(200).json({ success: true, message: "Profile updated successfully" });

        } catch (error) {
            console.error("Error updating profile:", error);
            res.status(500).json({ success: false, error: "Failed to update profile due to server error" });
        }
    });


    // ===============================================
    // বিদ্যমান ইউজার রুটস (Existing User Routes)
    // ===============================================

    // Register
    router.post("/register", async (req, res) => {
        const { name, email, role, password } = req.body;
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "User already exists" });

        const newUser = {
            name,
            email,
            role: role || "buyer",
            status: "pending",
            password, 
            createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ success: true, userId: result.insertedId });
    });

    // Get user profile by email
    router.get("/by-email/:email", async (req, res) => {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.send({
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            photoURL: user.photoURL || "",
            phone: user.phone || "",
        });
    });

    // Get role by email
    router.get("/role/:email", async (req, res) => {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
            return res.status(404).json({ role: null });
        }

        res.json({ role: user.role });
    });

    // Get all users
    router.get("/", async (req, res) => {
        const users = await usersCollection.find().toArray();
        res.status(200).json(users);
    });

    // Update Role (Admin Protected)
    router.put("/:id/role", async (req, res) => {
        const { role } = req.body;
        const id = req.params.id;
        const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } }
        );
        res.send(result);
    });

    // Update Status (Admin Protected)
    router.put("/:id/status", async (req, res) => {
        const { status, suspendReason } = req.body;
        const id = req.params.id;
        const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status, suspendReason: suspendReason || "" } }
        );
        res.send(result);
    });

    return router;
};