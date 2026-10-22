
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Adjust this path if your User model is stored elsewhere.
const User = require("../Modals/User");

async function createSuperAdmin() {
  try {
    const { Mongoose_uri, INITIAL_SUPER_ADMIN_EMAIL, INITIAL_SUPER_ADMIN_PASSWORD } =
      process.env;

    if (!Mongoose_uri || !INITIAL_SUPER_ADMIN_EMAIL || !INITIAL_SUPER_ADMIN_PASSWORD) {
      throw new Error("Missing required environment variables.");
    }

    if (INITIAL_SUPER_ADMIN_PASSWORD.length < 12) {
      throw new Error("Use a unique password with at least 12 characters.");
    }

    await mongoose.connect(Mongoose_uri);

    const existingAdmin = await User.findOne({
      platformRole: "super_admin",
      isDeleted: false,
    });

    if (existingAdmin) {
      throw new Error("A Super Admin already exists. Aborting.");
    }

    const email = INITIAL_SUPER_ADMIN_EMAIL.trim().toLowerCase();

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new Error("This email already belongs to an account.");
    }

    const hashedPassword = await bcrypt.hash(
      INITIAL_SUPER_ADMIN_PASSWORD,
      12
    );

    await User.create({
      fullName: "Platform Super Admin",
      email,
      password: hashedPassword,
      platformRole: "super_admin",
      role: "admin",
      status: "active",
      approvalStatus: "approved",
      emailVerified: true,
      isDeleted: false,
    });

    console.log("Super Admin created successfully.");
  } catch (error) {
    console.error("Super Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

createSuperAdmin();
