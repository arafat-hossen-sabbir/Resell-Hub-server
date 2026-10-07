const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

const invalidId = (res) =>
  res.status(400).json({ success: false, message: "Invalid product id" });

// Public: শুধু approved product
router.get("/", async (req, res) => {
  try {
    const products = await getDB()
      .collection("products")
      .find({ status: "approved" })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, products });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch products" });
  }
});

// Seller-এর নিজের product (সব status)। অবশ্যই "/:id" এর আগে থাকতে হবে
router.get("/my", authenticate, async (req, res) => {
  try {
    const products = await getDB()
      .collection("products")
      .find({ "sellerInfo.userId": req.user.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, products });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch your products" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    const product = await getDB()
      .collection("products")
      .findOne({ _id: new ObjectId(req.params.id), status: "approved" });

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, product });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch product" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { title, category, condition, description } = req.body;
    const price = Number(req.body.price);
    const stock = Number(req.body.stock) || 1;

    if (!title || !category || !condition || !description) {
      return res.status(400).json({
        success: false,
        message: "Required product information is missing",
      });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Price must be a positive number" });
    }

    if (!ObjectId.isValid(req.user.userId)) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const seller = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.userId) });

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Seller account not found" });
    }

    const images = Array.isArray(req.body.images)
      ? req.body.images.filter((img) => typeof img === "string")
      : [];

    const product = {
      title: String(title).trim(),
      category: String(category).trim(),
      condition: String(condition).trim(),
      price,
      stock: Math.max(stock, 1),
      images,
      description: String(description).trim(),
      sellerInfo: {
        userId: seller._id.toString(),
        name: seller.name,
        email: seller.email,
        phone: String(req.body.phone || seller.phone || ""),
      },
      location: String(req.body.location || seller.location || ""),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("products").insertOne(product);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: { ...product, _id: result.insertedId },
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to create product" });
  }
});

router.patch("/:id", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    const collection = getDB().collection("products");
    const _id = new ObjectId(req.params.id);
    const product = await collection.findOne({ _id });

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.sellerInfo?.userId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own products",
      });
    }

    const textFields = [
      "title",
      "category",
      "condition",
      "description",
      "location",
    ];
    const updates = {};

    textFields.forEach((field) => {
      if (typeof req.body[field] === "string" && req.body[field].trim()) {
        updates[field] = req.body[field].trim();
      }
    });

    if (req.body.price !== undefined) {
      const price = Number(req.body.price);
      if (!Number.isFinite(price) || price <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Price must be a positive number" });
      }
      updates.price = price;
    }

    if (req.body.stock !== undefined) {
      const stock = Number(req.body.stock);
      if (!Number.isInteger(stock) || stock < 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid stock value" });
      }
      updates.stock = stock;
    }

    if (Array.isArray(req.body.images)) {
      updates.images = req.body.images.filter((img) => typeof img === "string");
    }

    updates.updatedAt = new Date();

    const updated = await collection.findOneAndUpdate(
      { _id },
      { $set: updates },
      { returnDocument: "after" },
    );

    res.json({
      success: true,
      message: "Product updated successfully",
      product: updated,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to update product" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    const collection = getDB().collection("products");
    const _id = new ObjectId(req.params.id);
    const product = await collection.findOne({ _id });

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.sellerInfo?.userId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own products",
      });
    }

    await collection.deleteOne({ _id });

    res.json({ success: true, message: "Product deleted successfully" });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete product" });
  }
});

module.exports = router;
