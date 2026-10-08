const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/product/:productId", async (req, res) => {
  try {
    const db = getDB();
    const { productId } = req.params;

    const reviews = await db
      .collection("reviews")
      .find({ productId: new ObjectId(productId) })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { productId, rating, comment } = req.body;

    if (!productId || !rating || !comment) {
      return res.status(400).json({
        message: "Product, rating and comment are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5",
      });
    }

    const product = await db.collection("products").findOne({
      _id: new ObjectId(productId),
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const existingReview = await db.collection("reviews").findOne({
      productId: new ObjectId(productId),
      "reviewerInfo.userId": req.user.userId,
    });

    if (existingReview) {
      return res.status(400).json({
        message: "You have already reviewed this product",
      });
    }

    const review = {
      productId: new ObjectId(productId),
      reviewerInfo: {
        userId: req.user.userId,
        name: req.user.name || "Buyer",
        email: req.user.email,
      },
      rating: Number(rating),
      comment,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("reviews").insertOne(review);

    res.status(201).json({
      message: "Review added successfully",
      review: {
        _id: result.insertedId,
        ...review,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to add review",
    });
  }
});

router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { rating, comment } = req.body;

    const review = await db.collection("reviews").findOne({
      _id: new ObjectId(id),
    });

    if (!review) {
      return res.status(404).json({
        message: "Review not found",
      });
    }

    if (review.reviewerInfo.userId !== req.user.userId) {
      return res.status(403).json({
        message: "You can only update your own review",
      });
    }

    const updateData = {
      updatedAt: new Date(),
    };

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          message: "Rating must be between 1 and 5",
        });
      }

      updateData.rating = Number(rating);
    }

    if (comment !== undefined) {
      updateData.comment = comment;
    }

    await db
      .collection("reviews")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    const updatedReview = await db.collection("reviews").findOne({
      _id: new ObjectId(id),
    });

    res.json({
      message: "Review updated successfully",
      review: updatedReview,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update review",
    });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const review = await db.collection("reviews").findOne({
      _id: new ObjectId(id),
    });

    if (!review) {
      return res.status(404).json({
        message: "Review not found",
      });
    }

    if (review.reviewerInfo.userId !== req.user.userId) {
      return res.status(403).json({
        message: "You can only delete your own review",
      });
    }

    await db.collection("reviews").deleteOne({
      _id: new ObjectId(id),
    });

    res.json({
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete review",
    });
  }
});

module.exports = router;
