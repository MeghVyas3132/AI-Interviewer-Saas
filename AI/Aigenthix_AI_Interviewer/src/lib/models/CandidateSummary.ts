import mongoose from 'mongoose';

/**
 * CandidateSummary Model
 * Stores complete candidate information independently from PostgreSQL
 * This ensures reports persist even if candidates are deleted from admin section
 */
const candidateSummarySchema = new mongoose.Schema({
  // Unique identifiers
  candidate_id: { type: String, required: true, index: true }, // From PostgreSQL or email
  interview_id: { type: String, required: true, unique: true, index: true, sparse: false }, // PostgreSQL session ID (stable across environments)
  interview_token: { type: String, index: true }, // Interview session token (for reference, may change between environments)
  
  // Candidate information (stored independently)
  name: { type: String, required: true },
  email: { type: String, index: true },
  phone: { type: String },
  first_name: { type: String },
  last_name: { type: String },
  
  // Interview details
  role: { type: String }, // Job position or exam name
  exam_name: { type: String },
  subcategory_name: { type: String },
  position: { type: String }, // Job title
  
  // Interview results
  status: { type: String, default: 'pending', index: true }, // pending, shortlisted, rejected, abandoned
  overall_score: { type: Number, default: 0 },
  technical: { type: Number, default: 0 },
  communication: { type: Number, default: 0 },
  behavioral: { type: Number, default: 0 },
  plagiarism: { type: Number, default: 0 },
  authenticity: { type: Number, default: 0 },
  
  // Interview metadata
  duration: { type: String, default: '0m' },
  questions_count: { type: Number, default: 0 },
  completed_at: { type: Date, index: true },
  started_at: { type: Date },
  created_at: { type: Date, default: Date.now },
  
  // Full interview data (for detailed reports)
  interview_data: { type: Array, default: [] },
  results_json: { type: Object },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  strict: true, // Explicitly set strict mode
  strictQuery: false, // Allow querying with fields not in schema (for flexibility)
});

// Indexes for efficient querying
candidateSummarySchema.index({ candidate_id: 1, completed_at: -1 });
candidateSummarySchema.index({ email: 1, completed_at: -1 });
candidateSummarySchema.index({ status: 1, completed_at: -1 });
candidateSummarySchema.index({ overall_score: -1 });
candidateSummarySchema.index({ role: 1, completed_at: -1 });
candidateSummarySchema.index({ interview_id: 1 }); // Already has unique index, but explicit for clarity

export const CandidateSummary =
  mongoose.models.CandidateSummary ||
  mongoose.model('CandidateSummary', candidateSummarySchema);

