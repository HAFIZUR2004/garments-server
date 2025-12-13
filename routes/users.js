const { ObjectId } = require("mongodb");

module.exports = (db) => {
  const router = require("express").Router();
  const usersCollection = db.collection("users");

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
      password, // Note: Hash password in production
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    res.status(201).json({ success: true, userId: result.insertedId });
  });



  // Login
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
  });
});
 
// ✅ Get role by email
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

  // Update Role
  router.put("/:id/role", async (req, res) => {
    const { role } = req.body;
    const id = req.params.id;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );
    res.send(result);
  });

  // Update Status
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
