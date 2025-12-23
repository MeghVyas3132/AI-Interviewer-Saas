import mongoose from 'mongoose';

const resumeAnalysisSchema = new mongoose.Schema({
  // Link to interview session
  interviewToken: { type: String, required: true, index: true },
  interviewSessionId: { type: Number }, // PostgreSQL interview session ID
  
  // Candidate information
  candidateId: { type: Number },
  candidateName: { type: String },
  candidateEmail: { type: String },
  
  // File information
  fileName: { type: String, required: true },
  filePath: { type: String },
  fileSize: { type: Number },
  fileType: { type: String },
  
  // Extracted content
  extractedText: { type: String },
  comprehensiveResumeText: { type: String },
  
  // Analysis data
  analysis: {
    isResume: { type: Boolean },
    candidateName: { type: String },
    skills: { type: [String], default: [] },
    experienceSummary: { type: String },
    comprehensiveSummary: { type: String },
    atsScore: { type: Number },
    sectionRatings: {
      summary: { type: Number },
      skills: { type: Number },
      experience: { type: Number },
      education: { type: Number },
      formatting: { type: Number },
    },
    feedback: {
      grammar: { type: [String], default: [] },
      ats: { type: [String], default: [] },
      content: { type: [String], default: [] },
      formatting: { type: [String], default: [] },
    },
    strengths: { type: [String], default: [] },
    areasForImprovement: { type: [String], default: [] },
  },
  
  // Structured data (flexible schema to accommodate all fields from extractStructuredResumeData)
  // Using Mixed type to allow any structure from the AI analysis
  structuredData: { type: mongoose.Schema.Types.Mixed },
  
  // Metadata
  analyzedAt: { type: Date, default: Date.now },
  uploadedAt: { type: Date, default: Date.now },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Index for faster lookups
resumeAnalysisSchema.index({ interviewToken: 1 });
resumeAnalysisSchema.index({ candidateId: 1 });
resumeAnalysisSchema.index({ interviewSessionId: 1 });

export const ResumeAnalysis =
  mongoose.models.ResumeAnalysis ||
  mongoose.model('ResumeAnalysis', resumeAnalysisSchema);

