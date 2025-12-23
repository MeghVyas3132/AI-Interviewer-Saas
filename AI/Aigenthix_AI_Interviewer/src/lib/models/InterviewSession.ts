import mongoose from 'mongoose';

// Schema for individual Q&A pairs
const questionAnswerSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  isRealQuestion: { type: Boolean, default: true },
  responseType: { type: String, enum: ['spoken', 'typed', 'mixed'], default: 'typed' }, // Track whether response was spoken, typed, or mixed
  attempts: { type: Number, default: 1 },
  hintsGiven: { type: [String], default: [] },
  isCorrect: { type: Boolean },
  questionCategory: { type: String },
  isCurrentAffairs: { type: Boolean, default: false },
  currentAffairsTopic: { type: String },
  currentAffairsCategory: { type: String },
  referenceQuestionIds: { type: [Number], default: [] },
  feedback: {
    contentFeedback: String,
    toneFeedback: String,
    clarityFeedback: String,
    visualFeedback: String,
    physicalAppearanceScore: Number,
    physicalAppearanceJustification: String,
    bodyLanguageScore: Number,
    bodyLanguageJustification: String,
    confidenceScore: Number,
    confidenceJustification: String,
    ideasScore: Number,
    ideasJustification: String,
    organizationScore: Number,
    organizationJustification: String,
    accuracyScore: Number,
    accuracyJustification: String,
    voiceScore: Number,
    voiceJustification: String,
    grammarScore: Number,
    grammarJustification: String,
    stopWordsScore: Number,
    stopWordsJustification: String,
    overallScore: Number,
    isDisqualified: Boolean,
  },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const interviewSessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  candidate: {
    name: String,
    email: String,
    phone: String,
  },
  exam: { type: String },
  subcategory: { type: String },
  resumeText: { type: String },
  questionsGenerated: { type: Array },
  // Store all questions and answers
  questionsAndAnswers: { type: [questionAnswerSchema], default: [] },
  // Store complete interview data as received from frontend
  interviewData: { type: Array, default: [] },
  resultsJson: { type: Object }, // AI evaluation results
  summaryData: { type: Object }, // Computed analytics
  status: { type: String, default: 'pending' }, // pending, in_progress, completed, abandoned
  scheduledTime: Date,
  startedAt: Date,
  completedAt: Date,
  abandonedAt: Date,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

export const InterviewSession =
  mongoose.models.InterviewSession ||
  mongoose.model('InterviewSession', interviewSessionSchema);

