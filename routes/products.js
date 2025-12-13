const { ObjectId } = require("mongodb");

module.exports = (db) => {
  const router = require("express").Router();
  const productsCollection = db.collection("products");

  /* =====================
     GET 6 PRODUCTS (HOME)
  ===================== */
  router.get("/", async (req, res) => {
    try {
      const products = await productsCollection.find().limit(6).toArray();
      res.send(products);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch products" });
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

      if (!product) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send(product);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch product" });
    }
  });

  /* =====================
     POST ADD PRODUCT ✅
  ===================== */
  router.post("/", async (req, res) => {
    try {
      const product = req.body;

      if (!product.name || !product.price || !product.category) {
        return res.status(400).send({ message: "Missing required fields" });
      }

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
