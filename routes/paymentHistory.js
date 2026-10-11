const express = require("express");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();

const PER_PAGE = 12;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    const status = String(req.query.status || "All");
    const search = String(req.query.search || "").trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const query = {};

    if (["Paid", "Failed", "Pending", "Needs refund"].includes(status)) {
      query.status = status;
    }

    if (search) {
      const pattern = escapeRegex(search);
      query.$or = [
        { transactionId: { $regex: pattern, $options: "i" } },
        { productTitle: { $regex: pattern, $options: "i" } },
      ];
    }

    const collection = getDB().collection("payments");
    const total = await collection.countDocuments(query);

    const [payments, revenueRows] = await Promise.all([
      collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PER_PAGE)
        .limit(PER_PAGE)
        .toArray(),
      collection
        .aggregate([
          { $match: { status: "Paid" } },
          { $group: { _id: null, revenue: { $sum: "$amountBdt" } } },
        ])
        .toArray(),
    ]);

    res.json({
      success: true,
      payments,
      revenue: revenueRows[0]?.revenue || 0,
      pagination: {
        currentPage: page,
        total,
        totalPages: Math.ceil(total / PER_PAGE),
      },
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to load payments" });
  }
});

module.exports = router;
