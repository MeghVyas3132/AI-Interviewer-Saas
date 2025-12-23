import mongoose from 'mongoose';

// Schema for individual Q&A items in a transcript
const qaItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, default: 'qa' },
  at: { type: Date },
  question: { type: String },
  answer: { type: String },
  feedback: { type: String },
  scoring: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

// Schema for email-fetched transcripts
const transcriptSchema = new mongoose.Schema({
  candidate_id: { type: String, required: true, index: true },
  candidate_name: { type: String, required: true },
  candidate_email: { type: String, index: true },
  role: { type: String },
  interview_id: { type: String, index: true },
  status: { type: String, default: 'completed' },
  questions_count: { type: Number, default: 0 },
  qa: { type: [qaItemSchema], default: [] },
  completed_at: { type: Date },
  
  // Email metadata
  email_id: { type: String, unique: true, sparse: true }, // Unique email message ID
  email_subject: { type: String },
  email_from: { type: String },
  email_date: { type: Date },
  fetched_at: { type: Date, default: Date.now },
  
  // Analysis metadata
  analyzed: { type: Boolean, default: false },
  analyzed_at: { type: Date },
  analysis_results: { type: mongoose.Schema.Types.Mixed },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Indexes for efficient querying
transcriptSchema.index({ candidate_email: 1, completed_at: -1 });
transcriptSchema.index({ interview_id: 1 });
transcriptSchema.index({ status: 1, completed_at: -1 });
transcriptSchema.index({ analyzed: 1, analyzed_at: -1 });

export const Transcript =
  mongoose.models.Transcript || mongoose.model('Transcript', transcriptSchema);

