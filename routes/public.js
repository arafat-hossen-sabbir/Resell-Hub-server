const express = require("express");
const { getDB } = require("../config/db");

const router = express.Router();

const DEFAULT_CATEGORIES = [
  "Electronics",
  "Mobile Phones",
  "Furniture",
  "Fashion",
  "Vehicles",
  "Sports",
];

router.get("/stats", async (req, res) => {
  try {
    const db = getDB();

    const [products, sellers, buyers, completedOrders] = await Promise.all([
      db.collection("products").countDocuments({ status: "approved" }),
      db.collection("users").countDocuments({ role: "seller" }),
      db.collection("users").countDocuments({ role: "buyer" }),
      db.collection("orders").countDocuments({ orderStatus: "Delivered" }),
    ]);

    res.json({
      success: true,
      stats: { products, sellers, buyers, completedOrders },
    });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const rows = await getDB()
      .collection("products")
      .aggregate([
        { $match: { status: "approved", category: { $ne: null } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ])
      .toArray();

    const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
    const names = [
      ...DEFAULT_CATEGORIES,
      ...Object.keys(counts).filter(
        (name) => name && name !== "null" && !DEFAULT_CATEGORIES.includes(name),
      ),
    ];

    res.json({
      success: true,
      categories: names.map((name) => ({ name, count: counts[name] || 0 })),
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to load categories" });
  }
});

module.exports = router;
