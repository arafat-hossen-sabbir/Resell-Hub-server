const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole("admin"));

router.get("/stats", async (req, res) => {
  try {
    const db = getDB();

    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalPayments,
      sellers,
      buyers,
    ] = await Promise.all([
      db.collection("users").countDocuments(),
      db.collection("products").countDocuments(),
      db.collection("orders").countDocuments(),
      db.collection("payments").countDocuments(),
      db.collection("users").countDocuments({ role: "seller" }),
      db.collection("users").countDocuments({ role: "buyer" }),
    ]);

    const revenueResult = await db
      .collection("payments")
      .aggregate([
        {
          $match: {
            paymentStatus: "Paid",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ])
      .toArray();

    res.json({
      totalUsers,
      totalProducts,
      totalOrders,
      totalPayments,
      sellers,
      buyers,
      totalRevenue: revenueResult[0]?.total || 0,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch admin statistics",
    });
  }
});

router.get("/users", async (req, res) => {
  try {
    const db = getDB();

    const { search = "" } = req.query;

    const filter = search
      ? {
          $or: [
            {
              name: {
                $regex: search,
                $options: "i",
              },
            },
            {
              email: {
                $regex: search,
                $options: "i",
              },
            },
          ],
        }
      : {};

    const users = await db
      .collection("users")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.json(users);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch users",
    });
  }
});

router.patch("/users/:id/status", async (req, res) => {
  try {
    const db = getDB();
    const { status } = req.body;

    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const result = await db.collection("users").updateOne(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      message: `User ${status} successfully`,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update user status",
    });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const db = getDB();

    const result = await db.collection("users").deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to delete user",
    });
  }
});

router.get("/products", async (req, res) => {
  try {
    const db = getDB();

    const products = await db
      .collection("products")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json(products);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch products",
    });
  }
});

router.patch("/products/:id/status", async (req, res) => {
  try {
    const db = getDB();
    const { status } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        message: "Invalid product status",
      });
    }

    const result = await db.collection("products").updateOne(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.json({
      message: `Product ${status} successfully`,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update product status",
    });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const db = getDB();

    const result = await db.collection("products").deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to delete product",
    });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const db = getDB();

    const orders = await db
      .collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json(orders);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch orders",
    });
  }
});

module.exports = router;
