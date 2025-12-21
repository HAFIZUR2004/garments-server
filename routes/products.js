const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = (db) => {
  const router = express.Router();
  const productsCollection = db.collection("products");

  /* =====================================================
        1. GET HOME PRODUCTS (showHome = true, limit 6)
  ====================================================== */
  router.get("/", async (req, res) => {
    try {
      const products = await productsCollection
        .find({ showHome: true })
        .limit(6)
        .toArray();

      res.send(products);
    } catch (error) {
      console.error("Error fetching home products:", error);
      res.status(500).send({ message: "Failed to load home products" });
    }
  });

 // ১. সবার জন্য সব প্রোডাক্ট (All Products পেজের জন্য)
router.get("/all", async (req, res) => {
  try {
    const products = await productsCollection.find().toArray();
    res.send(products);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch products" });
  }
});

// ২. নির্দিষ্ট ম্যানেজারের প্রোডাক্ট (Manage Products পেজের জন্য)
router.get("/managed", async (req, res) => {
  try {
    // ফ্রন্টএন্ড থেকে পাঠানো ইমেইল কুয়েরি প্যারামিটার হিসেবে ধরছি
    const email = req.query.email; 
    if (!email) {
      return res.status(400).send({ message: "Manager email is required" });
    }
    const query = { managerEmail: email };
    const products = await productsCollection.find(query).toArray();
    res.send(products);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch managed products" });
  }
});
  /* =====================================================
        3. GET SINGLE PRODUCT BY ID
  ====================================================== */
  router.get("/:id", async (req, res) => {
    try {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid product ID" });
      }

      const product = await productsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!product) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send(product);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch product" });
    }
  });

  /* =====================================================
        4. UPDATE PRODUCT (EDIT)
  ====================================================== */
  router.put("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const updatedData = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid product ID" });
      }

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send({
        message: "✅ Product updated successfully",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      res.status(500).send({ message: "Failed to update product" });
    }
  });

  /* =====================================================
        5. TOGGLE SHOW HOME
  ====================================================== */
  router.patch("/:id/home", async (req, res) => {
    try {
      const id = req.params.id;
      const { showHome } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid product ID" });
      }

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { showHome: Boolean(showHome) } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send({
        message: "✅ showHome updated",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      res.status(500).send({ message: "Failed to update showHome" });
    }
  });

  /* =====================================================
        6. DELETE PRODUCT
  ====================================================== */
  router.delete("/:id", async (req, res) => {
    try {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid product ID" });
      }

      const result = await productsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send({
        message: "✅ Product deleted successfully",
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      res.status(500).send({ message: "Failed to delete product" });
    }
  });

  /* =====================================================
        7. ADD PRODUCT
  ====================================================== */
  router.post("/", async (req, res) => {
    try {
      const product = req.body;

      if (!product.name || !product.price || !product.category) {
        return res.status(400).send({
          message: "Missing required fields: name, price, category",
        });
      }

      product.createdAt = new Date();
      product.showHome = product.showHome ?? false;

      const result = await productsCollection.insertOne(product);

      res.send({
        insertedId: result.insertedId,
        message: "✅ Product added successfully",
      });
    } catch (error) {
      res.status(500).send({ message: "Failed to add product" });
    }
  });

  return router;
};
// create product page 