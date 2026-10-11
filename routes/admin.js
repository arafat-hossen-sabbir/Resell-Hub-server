const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole("admin"));

const PER_PAGE = 12;
const NOT_COUNTED = ["Cancelled", "Rejected"];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const paging = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  return { page, skip: (page - 1) * PER_PAGE };
};

const pagination = (page, total) => ({
  currentPage: page,
  total,
  totalPages: Math.ceil(total / PER_PAGE),
});

const invalidId = (res) =>
  res.status(400).json({ success: false, message: "Invalid id" });

const toCounts = (rows) =>
  rows.reduce((result, row) => {
    result[row._id || "unknown"] = row.count;
    return result;
  }, {});

const sum = (counts) =>
  Object.values(counts).reduce((total, value) => total + value, 0);

router.get("/stats", async (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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

router.get("/products", async (req, res) => {
  try {
    const status = String(req.query.status || "All");
    const search = String(req.query.search || "").trim();
    const { page, skip } = paging(req);
    const query = {};

    if (["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }

    if (search) {
      const pattern = escapeRegex(search);
      query.$or = [
        { title: { $regex: pattern, $options: "i" } },
        { "sellerInfo.name": { $regex: pattern, $options: "i" } },
      ];
    }

    const collection = getDB().collection("products");
    const total = await collection.countDocuments(query);
    const products = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PER_PAGE)
      .toArray();

    res.json({ success: true, products, pagination: pagination(page, total) });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to load products" });
  }
});

router.patch("/products/:id/status", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    const status = String(req.body.status || "");

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or rejected",
      });
    }

    const product = await getDB()
      .collection("products")
      .findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            status,
            reviewedBy: req.user.userId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
            rejectReason:
              status === "rejected" ? String(req.body.reason || "").trim() : "",
          },
        },
        { returnDocument: "after" },
      );

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, message: `Product ${status}`, product });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to update product" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const role = String(req.query.role || "All");
    const search = String(req.query.search || "").trim();
    const { page, skip } = paging(req);
    const query = {};

    if (["buyer", "seller", "admin"].includes(role)) {
      query.role = role;
    }

    if (search) {
      const pattern = escapeRegex(search);
      query.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { email: { $regex: pattern, $options: "i" } },
      ];
    }

    const collection = getDB().collection("users");
    const total = await collection.countDocuments(query);
    const users = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PER_PAGE)
      .toArray();

    res.json({ success: true, users, pagination: pagination(page, total) });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load users" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    if (req.params.id === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own account here",
      });
    }

    const updates = {};

    if (req.body.role !== undefined) {
      if (!["buyer", "seller", "admin"].includes(req.body.role)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid role" });
      }
      updates.role = req.body.role;
    }

    if (req.body.status !== undefined) {
      if (!["active", "blocked"].includes(req.body.status)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid status" });
      }
      updates.status = req.body.status;
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Nothing to update" });
    }

    updates.updatedAt = new Date();

    const user = await getDB()
      .collection("users")
      .findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: updates },
        { returnDocument: "after" },
      );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User updated", user });
  } catch {
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const status = String(req.query.status || "All");
    const { page, skip } = paging(req);
    const query = status !== "All" ? { orderStatus: status } : {};

    const collection = getDB().collection("orders");
    const total = await collection.countDocuments(query);
    const orders = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PER_PAGE)
      .toArray();

    res.json({ success: true, orders, pagination: pagination(page, total) });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load orders" });
  }
});

module.exports = router;
