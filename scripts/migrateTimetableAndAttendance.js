require("dotenv").config();
const mongoose = require("mongoose");
const Batch = require("../Modals/Batches");
const Timetable = require("../Modals/Timetable");
const ClassSession = require("../Modals/ClassSession");
const Attendance = require("../Modals/Attendence");
const Academy = require("../Modals/Academy");
const { DAY_NAME_TO_INDEX, normalizeDate, formatDateKey } = require("../Utils/dateUtils");
const { generateSessionsForTimetable } = require("../Utils/sessionGenerator");

async function runMigration() {
  const uri = process.env.Mongoose_uri || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ Mongoose_uri not found in environment variables.");
    process.exit(1);
  }

  console.log("🔄 Connecting to MongoDB for Timetable & Attendance migration...");
  await mongoose.connect(uri);
  console.log("✅ Connected.");

  try {
    const batches = await Batch.find({
      isDeleted: false,
      status: { $in: ["upcoming", "active"] },
    });

    console.log(`Found ${batches.length} active/upcoming batches.`);
    let timetablesCreated = 0;
    let sessionsLinked = 0;

    for (const batch of batches) {
      // Check if timetable already exists
      const existingTt = await Timetable.findOne({
        batch: batch._id,
        academyId: batch.academyId,
        isDeleted: false,
      });

      if (!existingTt && batch.schedule?.days?.length > 0 && batch.trainers?.length > 0) {
        const daysOfWeek = batch.schedule.days
          .map((d) => DAY_NAME_TO_INDEX[d.toLowerCase().trim()])
          .filter((idx) => idx !== undefined);

        if (daysOfWeek.length > 0 && batch.schedule.startTime && batch.schedule.endTime) {
          const timetable = await Timetable.create({
            academyId: batch.academyId,
            batch: batch._id,
            teacher: batch.trainers[0],
            daysOfWeek,
            days: batch.schedule.days.map((d) => d.toLowerCase().trim()),
            startTime: batch.schedule.startTime,
            endTime: batch.schedule.endTime,
            effectiveStartDate: normalizeDate(batch.startDate || new Date()),
            effectiveEndDate: batch.endDate ? normalizeDate(batch.endDate) : null,
            isActive: true,
            createdBy: batch.createdBy,
          });

          timetablesCreated++;
          console.log(`✓ Created timetable for batch "${batch.name}" (ID: ${batch._id})`);

          // Generate initial sessions
          const gen = await generateSessionsForTimetable(timetable._id, 30);
          console.log(`   Generated ${gen.createdCount} sessions.`);
        }
      }

      // Link any existing unlinked attendance records to scheduled sessions on same date
      const unlinkedAttendances = await Attendance.find({
        batch: batch._id,
        academyId: batch.academyId,
        session: null,
        isDeleted: false,
      });

      for (const att of unlinkedAttendances) {
        const attDate = normalizeDate(att.date);
        const matchingSession = await ClassSession.findOne({
          batch: batch._id,
          academyId: batch.academyId,
          date: attDate,
          isDeleted: false,
        });

        if (matchingSession) {
          att.session = matchingSession._id;
          await att.save();

          matchingSession.attendanceMarked = true;
          matchingSession.attendance = att._id;
          matchingSession.status = "completed";
          await matchingSession.save();

          sessionsLinked++;
        }
      }
    }

    console.log("\n================ MIGRATION COMPLETE ================");
    console.log(`• Timetables created from existing batch schedules: ${timetablesCreated}`);
    console.log(`• Historical attendance records linked to sessions: ${sessionsLinked}`);
    console.log("====================================================\n");
  } catch (err) {
    console.error("❌ Migration error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
