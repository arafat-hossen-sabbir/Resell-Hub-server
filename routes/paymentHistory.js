const express = require("express");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/my-payments", authMiddleware, async (req, res) => {
  try {
    const payments = await getDB()
      .collection("payments")
      .find({ buyerId: req.user.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, payments });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to load payment history" });
  }
});

router.get("/all", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const payments = await getDB()
      .collection("payments")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, payments });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to load payments" });
  }
});

module.exports = router;
