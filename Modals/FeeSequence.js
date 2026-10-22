const mongoose = require("mongoose");

const feeSequenceSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: "Academy", required: true },
  key: { type: String, required: true, default: "receipt" },
  value: { type: Number, default: 0 },
}, { timestamps: true });

feeSequenceSchema.index({ academyId: 1, key: 1 }, { unique: true });
module.exports = mongoose.models.FeeSequence || mongoose.model("FeeSequence", feeSequenceSchema);
