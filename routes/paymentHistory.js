const express = require("express");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/my-payments", authMiddleware, async (req, res) => {
  try {
    const db = getDB();

    const payments = await db
      .collection("payments")
      .find({
        buyerId: req.user.userId,
      })
      .sort({ date: -1 })
      .toArray();

    res.json(payments);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch payment history",
    });
  }
});

router.get("/all", authMiddleware, async (req, res) => {
  try {
    const db = getDB();

    const user = await db.collection("users").findOne({
      email: req.user.email,
    });

    if (!user || user.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    const payments = await db
      .collection("payments")
      .find({})
      .sort({ date: -1 })
      .toArray();

    res.json(payments);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch payments",
    });
  }
});

module.exports = router;
