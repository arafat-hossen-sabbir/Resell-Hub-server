const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./config/db");
const usersRouter = require("./routes/users");
const productsRouter = require("./routes/products");
const wishlistRouter = require("./routes/wishlist");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ReSell Hub server is running");
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "ReSell Hub API is healthy" });
});

app.use("/api/users", usersRouter);
app.use("/api/products", productsRouter);
app.use("/api/wishlist", wishlistRouter);

const startServer = async () => {
  await connectDB();
  app.listen(port, () => {
    console.log(`ReSell Hub server running on port ${port}`);
  });
};

startServer();
