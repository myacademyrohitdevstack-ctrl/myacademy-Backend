/* Importing the `mongoose` and `dns` modules. */
const mongoose = require("mongoose");
const dns = require("dns");

// Fallback to public DNS to prevent Windows/ISP querySrv ECONNREFUSED on MongoDB Atlas
if (dns && typeof dns.setServers === "function") {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch (dnsErr) {
    // Ignore if not supported in custom environment
  }
}

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
