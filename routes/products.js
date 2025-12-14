const { ObjectId } = require("mongodb");

module.exports = (db) => {
  const router = require("express").Router();
  const productsCollection = db.collection("products");

  /* =====================
     GET HOME PRODUCTS
     (ONLY showHome = true, limit 6)
  ===================== */
  router.get("/", async (req, res) => {
    try {
      const products = await productsCollection
        .find({ showHome: true })
        .limit(6)
        .toArray();

      res.send(products);
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Failed to fetch home products" });
    }
  });

  /* =====================
     GET ALL PRODUCTS
  ===================== */
  router.get("/all", async (req, res) => {
    try {
      const products = await productsCollection.find().toArray();
      res.send(products);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch products" });
    }
  });

  /* =====================
     GET SINGLE PRODUCT
  ===================== */
  router.get("/:id", async (req, res) => {
    try {
      const product = await productsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      if (!product) return res.status(404).send({ message: "Product not found" });

      res.send(product);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch product" });
    }
  });

  /* =====================
     UPDATE PRODUCT (EDIT)
  ===================== */
  router.put("/:id", async (req, res) => {
    try {
      const updatedData = req.body;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updatedData }
      );

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Product not found" });

      res.send({ message: "✅ Product updated successfully", modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ message: "Failed to update product" });
    }
  });

  /* =====================
     TOGGLE SHOW HOME
  ===================== */
  router.patch("/:id/home", async (req, res) => {
    try {
      const { showHome } = req.body;

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { showHome } }
      );

      if (result.matchedCount === 0)
        return res.status(404).send({ message: "Product not found" });

      res.send({ message: "✅ Show home updated", modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ message: "Failed to update showHome" });
    }
  });

  /* =====================
     DELETE PRODUCT
  ===================== */
  router.delete("/:id", async (req, res) => {
    try {
      const result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

      if (result.deletedCount === 0)
        return res.status(404).send({ message: "Product not found" });

      res.send({ message: "✅ Product deleted successfully", deletedCount: result.deletedCount });
    } catch (error) {
      res.status(500).send({ message: "Failed to delete product" });
    }
  });

  /* =====================
     POST ADD PRODUCT
  ===================== */
  router.post("/", async (req, res) => {
    try {
      const product = req.body;
      if (!product.name || !product.price || !product.category)
        return res.status(400).send({ message: "Missing required fields" });

      const result = await productsCollection.insertOne(product);
      res.send({ insertedId: result.insertedId, message: "✅ Product added successfully" });
    } catch (error) {
      res.status(500).send({ message: "Failed to add product" });
    }
  });

  return router;
};
