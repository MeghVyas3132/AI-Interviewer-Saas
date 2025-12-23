import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  sessionToken: { type: String, required: true, index: true },
  candidateEmail: String,
  candidateName: String,
  atsScore: Number,
  sectionRatings: Object,
  aiFeedback: Object,
  performanceMetrics: Object,
  reportJson: Object, // complete data used in frontend
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

export const Report =
  mongoose.models.Report || mongoose.model('Report', reportSchema);

