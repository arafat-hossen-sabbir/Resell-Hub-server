const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

const invalidId = (res) =>
  res.status(400).json({ success: false, message: "Invalid id" });

// Seller কোন status থেকে কোন status-এ যেতে পারবে
const statusFlow = {
  Pending: ["Accepted", "Rejected"],
  Accepted: ["Processing"],
  Processing: ["Shipped"],
  Shipped: ["Delivered"],
};

const restoreStock = (db, order) =>
  db
    .collection("products")
    .updateOne({ _id: order.productId }, { $inc: { stock: order.quantity } });

router.post("/", authenticate, async (req, res) => {
  const db = getDB();
  let reservedProductId = null;
  let reservedQuantity = 0;

  try {
    const { productId, shippingAddress } = req.body;
    const quantity = Number(req.body.quantity ?? 1);

    if (!ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid product id is required" });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product quantity" });
    }

    const address = {
      name: String(shippingAddress?.name || "").trim(),
      phone: String(shippingAddress?.phone || "").trim(),
      address: String(shippingAddress?.address || "").trim(),
    };

    if (!address.name || !address.phone || !address.address) {
      return res.status(400).json({
        success: false,
        message: "Shipping name, phone and address are required",
      });
    }

    if (!ObjectId.isValid(req.user.userId)) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const buyer = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.userId) });

    if (!buyer) {
      return res
        .status(404)
        .json({ success: false, message: "Buyer account not found" });
    }

    const product = await db.collection("products").findOne({
      _id: new ObjectId(productId),
      status: "approved",
    });

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.sellerInfo.userId === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot order your own product",
      });
    }

    // Stock atomically কমানো: stock যথেষ্ট থাকলেই কমবে
    const reserved = await db.collection("products").findOneAndUpdate(
      { _id: product._id, status: "approved", stock: { $gte: quantity } },
      { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!reserved) {
      return res.status(400).json({
        success: false,
        message: "Not enough stock available",
      });
    }

    reservedProductId = product._id;
    reservedQuantity = quantity;

    const order = {
      buyerInfo: {
        userId: buyer._id.toString(),
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone || address.phone,
      },
      sellerInfo: product.sellerInfo,
      productId: product._id,
      productTitle: product.title,
      productImage: product.images?.[0] || "",
      quantity,
      totalPrice: product.price * quantity,
      paymentStatus: "Pending",
      orderStatus: "Pending",
      shippingAddress: address,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("orders").insertOne(order);

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: { ...order, _id: result.insertedId },
    });
  } catch {
    // Order save না হলে stock ফেরত দাও
    if (reservedProductId) {
      await db
        .collection("products")
        .updateOne(
          { _id: reservedProductId },
          { $inc: { stock: reservedQuantity } },
        )
        .catch(() => {});
    }
    res.status(500).json({ success: false, message: "Failed to create order" });
  }
});

router.get("/my-orders", authenticate, async (req, res) => {
  try {
    const orders = await getDB()
      .collection("orders")
      .find({ "buyerInfo.userId": req.user.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, orders });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch orders" });
  }
});

router.get("/seller-orders", authenticate, async (req, res) => {
  try {
    const orders = await getDB()
      .collection("orders")
      .find({ "sellerInfo.userId": req.user.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, orders });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch seller orders" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    const order = await getDB()
      .collection("orders")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const isBuyer = order.buyerInfo.userId === req.user.userId;
    const isSeller = order.sellerInfo.userId === req.user.userId;

    if (!isBuyer && !isSeller) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this order",
      });
    }

    res.json({ success: true, order });
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch order" });
  }
});

// Buyer cancel
router.patch("/:id/cancel", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    const db = getDB();
    const _id = new ObjectId(req.params.id);

    const existing = await db
      .collection("orders")
      .findOne({ _id, "buyerInfo.userId": req.user.userId });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const cancelled = await db.collection("orders").findOneAndUpdate(
      { _id, orderStatus: { $in: ["Pending", "Accepted"] } },
      { $set: { orderStatus: "Cancelled", updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!cancelled) {
      return res.status(400).json({
        success: false,
        message: "This order can no longer be cancelled",
      });
    }

    await restoreStock(db, cancelled);

    res.json({ success: true, message: "Order cancelled successfully" });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to cancel order" });
  }
});

// Seller status update
router.patch("/:id/status", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return invalidId(res);

    const db = getDB();
    const _id = new ObjectId(req.params.id);
    const { orderStatus } = req.body;

    const order = await db
      .collection("orders")
      .findOne({ _id, "sellerInfo.userId": req.user.userId });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const allowedNext = statusFlow[order.orderStatus] || [];

    if (!allowedNext.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: allowedNext.length
          ? `From ${order.orderStatus} you can only move to: ${allowedNext.join(", ")}`
          : `A ${order.orderStatus} order cannot be updated`,
      });
    }

    const updated = await db.collection("orders").findOneAndUpdate(
      { _id, orderStatus: order.orderStatus },
      { $set: { orderStatus, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Order was changed by someone else, please refresh",
      });
    }

    if (orderStatus === "Rejected") {
      await restoreStock(db, updated);
    }

    res.json({
      success: true,
      message: "Order status updated successfully",
      order: updated,
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
});

module.exports = router;