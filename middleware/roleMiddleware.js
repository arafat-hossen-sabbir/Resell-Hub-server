const { getDB } = require("../config/db");

const requireRole = (...roles) => {
  return async (req, res, next) => {
    try {
      const db = getDB();

      const user = await db.collection("users").findOne({
        email: req.user.email,
      });

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      if (user.status === "blocked") {
        return res.status(403).json({
          message: "Your account has been blocked",
        });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({
          message: "You do not have permission",
        });
      }

      req.currentUser = user;

      next();
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Authorization failed",
      });
    }
  };
};

module.exports = requireRole;
