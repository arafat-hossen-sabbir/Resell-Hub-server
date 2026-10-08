const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

const requireRole =
  (...allowedRoles) =>
  async (req, res, next) => {
    try {
      if (!req.user || !ObjectId.isValid(req.user.userId)) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const user = await getDB()
        .collection("users")
        .findOne(
          { _id: new ObjectId(req.user.userId) },
          { projection: { role: 1, status: 1 } },
        );

      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }

      if (user.status === "blocked") {
        return res
          .status(403)
          .json({ success: false, message: "Your account has been blocked" });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action",
        });
      }

      req.user.role = user.role;
      next();
    } catch {
      res
        .status(500)
        .json({ success: false, message: "Failed to verify permission" });
    }
  };

module.exports = requireRole;
