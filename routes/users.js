const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { getAuth } = require("../config/firebase");
const authenticate = require("../middleware/authMiddleware");
const { createToken } = require("../utils/jwt");

const router = express.Router();

router.post("/sync", async (req, res) => {
  const authorization = req.headers.authorization || "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.split(" ")[1]
    : null;

  if (!idToken) {
    return res
      .status(401)
      .json({ success: false, message: "Firebase token required" });
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error("Firebase verify failed:", error.code, error.message);
    return res
      .status(401)
      .json({ success: false, message: "Invalid Firebase token" });
  }

  if (!decoded.email) {
    return res
      .status(400)
      .json({ success: false, message: "Email not found on account" });
  }

  try {
    const email = decoded.email;
    const name = String(req.body.name || decoded.name || email.split("@")[0]);
    const photo = String(req.body.photo || decoded.picture || "");
    const now = new Date();

    const user = await getDB()
      .collection("users")
      .findOneAndUpdate(
        { email },
        {
          $setOnInsert: {
            name,
            email,
            photo,
            role: "buyer",
            phone: "",
            location: "",
            status: "active",
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, returnDocument: "after" },
      );

    if (user.status === "blocked") {
      return res
        .status(403)
        .json({ success: false, message: "Your account has been blocked" });
    }

    const token = createToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    res.json({ success: true, user, token });
  } catch (error) {
    console.error("User sync failed:", error.message);
    res.status(500).json({ success: false, message: "Failed to sync user" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.user.userId)) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const user = await getDB()
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.userId) });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user });
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
});

router.patch("/me", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.user.userId)) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const allowedFields = ["name", "photo", "phone", "location"];
    const updates = {};

    allowedFields.forEach((field) => {
      if (typeof req.body[field] === "string") {
        updates[field] = req.body[field].trim();
      }
    });

    if (updates.name === "") {
      return res
        .status(400)
        .json({ success: false, message: "Name cannot be empty" });
    }

    updates.updatedAt = new Date();

    const user = await getDB()
      .collection("users")
      .findOneAndUpdate(
        { _id: new ObjectId(req.user.userId) },
        { $set: updates },
        { returnDocument: "after" },
      );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "Profile updated successfully", user });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to update profile" });
  }
});

router.post("/become-seller", authenticate, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.user.userId)) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const users = getDB().collection("users");
    const _id = new ObjectId(req.user.userId);
    const user = await users.findOne({ _id });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.status === "blocked") {
      return res
        .status(403)
        .json({ success: false, message: "Your account has been blocked" });
    }

    if (user.role !== "buyer") {
      return res.json({
        success: true,
        message: "You can already sell products",
        user,
      });
    }

    const updated = await users.findOneAndUpdate(
      { _id, role: "buyer" },
      { $set: { role: "seller", updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    res.json({
      success: true,
      message: "You are now a seller",
      user: updated || user,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to update account" });
  }
});

module.exports = router;
