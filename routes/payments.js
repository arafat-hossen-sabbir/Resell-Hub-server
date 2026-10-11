const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const stripe = require("../utils/stripe");

const router = express.Router();

const clientUrl = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim();

const toMinorUnits = (totalPrice) => {
  const currency = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
  const rate = Number(process.env.USD_BDT_RATE) || 120;
  const amount =
    currency === "bdt"
      ? Math.round(totalPrice * 100)
      : Math.round((totalPrice / rate) * 100);

  return { currency, amount: Math.max(amount, 50) };
};

let indexReady = false;

const ensureIndex = async () => {
  if (indexReady) return;
  await getDB()
    .collection("payments")
    .createIndex({ sessionId: 1 }, { unique: true, sparse: true });
  indexReady = true;
};

router.post("/session", authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid order id is required" });
    }

    const order = await getDB()
      .collection("orders")
      .findOne({
        _id: new ObjectId(orderId),
        "buyerInfo.userId": req.user.userId,
      });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.paymentStatus === "Paid") {
      return res
        .status(400)
        .json({ success: false, message: "This order is already paid" });
    }

    if (["Cancelled", "Rejected"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "A cancelled or rejected order cannot be paid",
      });
    }

    const { currency, amount } = toMinorUnits(order.totalPrice);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: order.buyerInfo.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: `${order.productTitle} (x${order.quantity})`,
            },
          },
        },
      ],
      metadata: { orderId: order._id.toString(), buyerId: req.user.userId },
      success_url: `${clientUrl()}/dashboard/payments?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl()}/dashboard/orders?payment=cancelled`,
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error("Checkout session failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Could not start the payment" });
  }
});

router.post("/confirm", authMiddleware, async (req, res) => {
  try {
    const sessionId = String(req.body.sessionId || "");

    if (!sessionId.startsWith("cs_")) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment session" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.buyerId !== req.user.userId) {
      return res
        .status(403)
        .json({ success: false, message: "This payment is not yours" });
    }

    if (session.payment_status !== "paid") {
      return res
        .status(400)
        .json({ success: false, message: "Payment has not been completed" });
    }

    const db = getDB();
    await ensureIndex();

    const order = await db.collection("orders").findOne({
      _id: new ObjectId(session.metadata.orderId),
      "buyerInfo.userId": req.user.userId,
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const refundNeeded = ["Cancelled", "Rejected"].includes(order.orderStatus);

    await db.collection("payments").updateOne(
      { sessionId },
      {
        $setOnInsert: {
          sessionId,
          transactionId: String(session.payment_intent || ""),
          buyerId: req.user.userId,
          orderId: order._id,
          productTitle: order.productTitle,
          productImage: order.productImage || "",
          amountBdt: order.totalPrice,
          amountCharged: (session.amount_total || 0) / 100,
          currency: String(session.currency || "").toUpperCase(),
          status: refundNeeded ? "Needs refund" : "Paid",
          method: "Card",
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    if (!refundNeeded) {
      await db
        .collection("orders")
        .updateOne(
          { _id: order._id },
          { $set: { paymentStatus: "Paid", paidAt: new Date() } },
        );
    }

    res.json({ success: true, refundNeeded });
  } catch (error) {
    console.error("Payment confirm failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Could not confirm the payment" });
  }
});

module.exports = router;
