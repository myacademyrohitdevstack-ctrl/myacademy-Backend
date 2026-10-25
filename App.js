const express = require("express");
const  cors = require("cors");
const cookieParser=require('cookie-parser')
const morgan = require("morgan");
const helmet = require('helmet');
const errorHandler = require("./Middleware/errorHandler.js");
/* Creating an instance of the express server. */
const app = express();
app.set('trust proxy', 1);
/* Allowing the server to accept requests from other domains. */
const allowedOrigins = [
  process.env.Frontend_Url,
  "https://app.rohitdevstack.online",
  "https://api.rohitdevstack.online",
  "https://rohitdevstack.online",
  "http://localhost:3000",
  "http://localhost:3001",
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const parsed = new URL(origin);
      if (
        allowedOrigins.includes(origin) ||
        parsed.hostname.endsWith("rohitdevstack.online") ||
        parsed.hostname === "localhost"
      ) {
        return callback(null, true);
      }
    } catch (e) {}
    return callback(null, true);
  },
  credentials: true
}))
app.use(helmet())
if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}
app.use(cookieParser())
// ping every 5 min
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/public-stats', async (req, res) => {
  try {
    const User = require("./Modals/User");
    const Batch = require("./Modals/Batches");
    const Course = require("./Modals/Courses");

    const [students, teachers, batches, courses] = await Promise.all([
      User.countDocuments({ role: "student", isDeleted: false }),
      User.countDocuments({ role: "teacher", isDeleted: false }),
      Batch.countDocuments({ isDeleted: false }),
      Course.countDocuments({ isDeleted: false }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        students,
        teachers,
        batches,
        courses,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching stats" });
  }
});

/* Setting the limit of the data that can be sent to the server. */
app.use(express.json({ limit: "50mb" }));

/* Importing the routes from the files in the Routes folder. */
app.use("/api/auth", require("./Routes/auth"));
app.use("/api/admin/staff", require("./Routes/staff"));
app.use("/api/admin", require("./Routes/admin"));
app.use("/api/student", require("./Routes/student"));
app.use("/api/teacher", require("./Routes/teacher"));
app.use("/api/user", require("./Routes/user"));
app.use("/api/courses", require("./Routes/courses"));
app.use("/api/batches", require("./Routes/batches"));
app.use("/api/class", require("./Routes/classLink"));
app.use("/api/notes", require("./Routes/note"));
app.use("/api/announcements", require("./Routes/announcement"));
app.use("/api/attendence", require("./Routes/attendence"));
app.use("/api/fees", require("./Routes/fees"));
app.use("/api/parent", require("./Routes/parent"));
app.use("/api/admin/parent-links", require("./Routes/parentManagement"));
app.use("/api/super-admin", require("./Routes/superAdmin"));
app.use("/api/exams", require("./Routes/exam"));
app.use("/api/homework", require("./Routes/homework"));
app.use("/api/whatsapp-reminders", require("./Routes/whatsappReminders"));
app.use("/api/webhooks", require("./Routes/webhooks"));
app.use("/api/notifications", require("./Routes/notification"));

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});
app.use(errorHandler)
module.exports = app