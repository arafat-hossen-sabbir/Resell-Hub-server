const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const stripe = require("../utils/stripe");

const router = express.Router();

router.post("/create-intent", authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Order ID is required",
      });
    }

    const order = await db.collection("orders").findOne({
      _id: new ObjectId(orderId),
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.buyerInfo.userId !== req.user.userId) {
      return res.status(403).json({
        message: "You can only pay for your own orders",
      });
    }

    if (order.paymentStatus === "Paid") {
      return res.status(400).json({
        message: "This order has already been paid",
      });
    }

    if (order.orderStatus === "Cancelled") {
      return res.status(400).json({
        message: "Cancelled orders cannot be paid",
      });
    }

    const conversionRate = Number(process.env.USD_BDT_RATE || 120);

    const amountInCents = Math.round(
      (Number(order.totalPrice) / conversionRate) * 100,
    );

    if (amountInCents < 50) {
      return res.status(400).json({
        message: "Payment amount is too small",
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: process.env.STRIPE_CURRENCY || "usd",
      metadata: {
        orderId: order._id.toString(),
        buyerId: req.user.userId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to create payment intent",
    });
  }
});

router.post("/confirm", authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        message: "Payment intent ID is required",
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata.buyerId !== req.user.userId) {
      return res.status(403).json({
        message: "Payment does not belong to this buyer",
      });
    }

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({
        message: "Payment has not been completed",
        status: paymentIntent.status,
      });
    }

    const orderId = paymentIntent.metadata.orderId;

    const order = await db.collection("orders").findOne({
      _id: new ObjectId(orderId),
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const existingPayment = await db.collection("payments").findOne({
      transactionId: paymentIntent.id,
    });

    if (existingPayment) {
      return res.json({
        message: "Payment already recorded",
        payment: existingPayment,
      });
    }

    const payment = {
      orderId: new ObjectId(orderId),
      transactionId: paymentIntent.id,
      buyerId: req.user.userId,
      amount: order.totalPrice,
      paymentStatus: "Paid",
      method: "Card",
      date: new Date(),
    };

    await db.collection("payments").insertOne(payment);

    await db.collection("orders").updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          paymentStatus: "Paid",
          updatedAt: new Date(),
        },
      },
    );

    res.json({
      message: "Payment confirmed successfully",
      payment,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to confirm payment",
    });
  }
});

module.exports = router;
