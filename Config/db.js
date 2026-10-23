/* Importing the `mongoose` module. */
const mongoose = require("mongoose");

/**
 * It connects to the mongoose database.
 */
const mongooseConnectToDb = async () => {
  try {
    if (!process.env.Mongoose_uri) {
      console.error(
        "❌ Missing Mongoose_uri in environment variables (.env).\n" +
        "👉 Please set Mongoose_uri in D:\\myacademy-backend\\.env to your MongoDB Atlas connection string (or local MongoDB URI)."
      );
      process.exit(1);
    }
    await mongoose.connect(process.env.Mongoose_uri);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message || error);
    process.exit(1);
  }
};
/* Exporting the function `mongooseConnectToDb` to be used in other files. */
module.exports = mongooseConnectToDb;
