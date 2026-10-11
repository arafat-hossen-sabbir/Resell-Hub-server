const express = require("express");
const { getDB } = require("../config/db");
const authenticate = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();

const NOT_COUNTED = ["Cancelled", "Rejected"];

const toCounts = (rows) =>
  rows.reduce((result, row) => {
    result[row._id || "unknown"] = row.count;
    return result;
  }, {});

router.get("/stats", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const db = getDB();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const sixMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
    );

    const [
      usersByRole,
      newUsers,
      productsByStatus,
      ordersByStatus,
      revenueRows,
      monthly,
      recentOrders,
    ] = await Promise.all([
      db
        .collection("users")
        .aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }])
        .toArray(),
      db.collection("users").countDocuments({ createdAt: { $gte: weekAgo } }),
      db
        .collection("products")
        .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
        .toArray(),
      db
        .collection("orders")
        .aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }])
        .toArray(),
      db
        .collection("orders")
        .aggregate([
          { $match: { orderStatus: { $nin: NOT_COUNTED } } },
          { $group: { _id: null, revenue: { $sum: "$totalPrice" } } },
        ])
        .toArray(),
      db
        .collection("orders")
        .aggregate([
          {
            $match: {
              orderStatus: { $nin: NOT_COUNTED },
              createdAt: { $gte: sixMonthsAgo },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              revenue: { $sum: "$totalPrice" },
              orders: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      db
        .collection("orders")
        .find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .project({
          productTitle: 1,
          productImage: 1,
          totalPrice: 1,
          orderStatus: 1,
          createdAt: 1,
          "buyerInfo.name": 1,
          "sellerInfo.name": 1,
        })
        .toArray(),
    ]);

    const users = toCounts(usersByRole);
    const products = toCounts(productsByStatus);
    const orders = toCounts(ordersByStatus);

    const sum = (counts) =>
      Object.values(counts).reduce((total, value) => total + value, 0);

    res.json({
      success: true,
      stats: {
        users: {
          total: sum(users),
          buyers: users.buyer || 0,
          sellers: users.seller || 0,
          admins: users.admin || 0,
          newThisWeek: newUsers,
        },
        products: {
          total: sum(products),
          approved: products.approved || 0,
          pending: products.pending || 0,
          rejected: products.rejected || 0,
        },
        orders: { total: sum(orders), byStatus: orders },
        revenue: revenueRows[0]?.revenue || 0,
        monthly: monthly.map((row) => ({
          key: row._id,
          revenue: row.revenue,
          orders: row.orders,
        })),
        recentOrders,
      },
    });
  } catch (error) {
    console.error("Admin stats failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to load statistics" });
  }
});

module.exports = router;
