const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

const invalidId = (res) =>
  res.status(400).json({ success: false, message: "Invalid product id" });

router.get("/", authenticate, async (req, res) => {
  try {
    const wishlist = await getDB()
      .collection("wishlists")
      .aggregate([
        { $match: { userId: req.user.userId } },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        { $match: { "product.status": "approved" } },
        { $sort: { createdAt: -1 } },
      ])
      .toArray();

    res.json({ success: true, wishlist });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch wishlist" });
  }
});

router.post("/:productId", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.productId)) return invalidId(res);

    const db = getDB();
    const productId = new ObjectId(req.params.productId);

    const product = await db
      .collection("products")
      .findOne({ _id: productId, status: "approved" });

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const wishlistItem = {
      userId: req.user.userId,
      productId,
      createdAt: new Date(),
    };

    try {
      const result = await db.collection("wishlists").insertOne(wishlistItem);

      res.status(201).json({
        success: true,
        message: "Product added to wishlist",
        wishlist: { ...wishlistItem, _id: result.insertedId },
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "Product is already in wishlist",
        });
      }
      throw error;
    }
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to add product to wishlist",
    });
  }
});

router.delete("/:productId", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.productId)) return invalidId(res);

    const result = await getDB()
      .collection("wishlists")
      .deleteOne({
        userId: req.user.userId,
        productId: new ObjectId(req.params.productId),
      });

    if (!result.deletedCount) {
      return res
        .status(404)
        .json({ success: false, message: "Wishlist item not found" });
    }

    res.json({ success: true, message: "Product removed from wishlist" });
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to remove product from wishlist",
    });
  }
});

module.exports = router;
