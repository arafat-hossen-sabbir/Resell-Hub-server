const { MongoClient, ServerApiVersion } = require("mongodb");

let client;
let database;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("MONGODB_URI is missing in .env");
    process.exit(1);
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  try {
    await client.connect();
    database = client.db("resellHub");
    await database.command({ ping: 1 });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

const getDB = () => {
  if (!database) {
    throw new Error("Database has not been initialized");
  }
  return database;
};

module.exports = { connectDB, getDB };
