-- =============================================================================
-- AI Interview Assistant - Database Initialization
-- =============================================================================
-- This script runs when PostgreSQL container starts for the first time

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
CREATE TYPE interview_round_type AS ENUM (
    'TECHNICAL_AI',
    'SCREENING_HUMAN',
    'HR_HUMAN',
    'MANAGERIAL_HUMAN',
    'CULTURAL_FIT_HUMAN'
);

CREATE TYPE interview_mode AS ENUM (
    'AI_CONDUCTED',
    'HUMAN_AI_ASSISTED',
    'HUMAN_ONLY'
);

CREATE TYPE round_status AS ENUM (
    'SCHEDULED',
    'WAITING_FOR_CANDIDATE',
    'WAITING_FOR_INTERVIEWER',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
);

CREATE TYPE insight_type AS ENUM (
    'SPEECH_CONFIDENCE',
    'HESITATION',
    'RESPONSE_LATENCY',
    'HEAD_MOVEMENT',
    'VIDEO_QUALITY',
    'MULTIPLE_FACES',
    'FACE_SWITCH',
    'TAB_SWITCH',
    'BACKGROUND_VOICE',
    'RESUME_CONTRADICTION'
);

CREATE TYPE alert_severity AS ENUM (
    'INFO',
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

CREATE TYPE verdict_decision AS ENUM (
    'ADVANCE',
    'REJECT',
    'HOLD',
    'REASSESS'
);

-- =============================================================================
-- Core Tables
-- =============================================================================

-- Interview Rounds Table
-- Stores each round of an interview (links to main app's interview table via interview_id)
CREATE TABLE interview_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to main AI Interviewer app (will be foreign key after merge)
    external_interview_id VARCHAR(255) NOT NULL,
    external_candidate_id VARCHAR(255) NOT NULL,
    external_interviewer_id VARCHAR(255), -- NULL for AI-conducted rounds
    external_job_role_id VARCHAR(255) NOT NULL,
    
    -- Round details
    round_number INTEGER NOT NULL DEFAULT 1,
    round_type interview_round_type NOT NULL,
    interview_mode interview_mode NOT NULL,
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ,
    scheduled_duration_minutes INTEGER DEFAULT 60,
    
    -- Actual timing
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    
    -- VideoSDK integration
    videosdk_meeting_id VARCHAR(255),
    videosdk_token TEXT,
    
    -- Status
    status round_status NOT NULL DEFAULT 'SCHEDULED',
    
    -- Consent tracking
    candidate_consent_given BOOLEAN DEFAULT FALSE,
    candidate_consent_timestamp TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes for common queries
    CONSTRAINT valid_round_number CHECK (round_number > 0)
);

-- Index for fast lookups
CREATE INDEX idx_interview_rounds_external_interview ON interview_rounds(external_interview_id);
CREATE INDEX idx_interview_rounds_external_candidate ON interview_rounds(external_candidate_id);
CREATE INDEX idx_interview_rounds_status ON interview_rounds(status);
CREATE INDEX idx_interview_rounds_scheduled ON interview_rounds(scheduled_at);

-- =============================================================================
-- Resume Storage (for contradiction detection)
-- =============================================================================

CREATE TABLE candidate_resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_candidate_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Resume data in structured JSON format
    resume_json JSONB NOT NULL,
    
    -- Extracted key points for quick matching
    key_facts JSONB, -- {"companies": [...], "skills": [...], "dates": {...}}
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_resumes_external_id ON candidate_resumes(external_candidate_id);
CREATE INDEX idx_candidate_resumes_key_facts ON candidate_resumes USING GIN(key_facts);

-- =============================================================================
-- Live Insights (Real-time metrics during interview)
-- =============================================================================

CREATE TABLE live_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    
    -- Timing
    timestamp_ms BIGINT NOT NULL, -- Milliseconds from interview start
    
    -- Insight details
    insight_type insight_type NOT NULL,
    severity alert_severity NOT NULL DEFAULT 'INFO',
    
    -- Flexible value storage
    value JSONB NOT NULL,
    -- Examples:
    -- SPEECH_CONFIDENCE: {"score": 0.78, "window_seconds": 10}
    -- HESITATION: {"filler_word": "um", "duration_ms": 500, "count_in_window": 3}
    -- MULTIPLE_FACES: {"face_count": 2, "confidence": 0.95}
    -- RESUME_CONTRADICTION: {"claim": "3 years at X", "resume_says": "1.5 years", "confidence": 0.87}
    
    -- Human-readable explanation (for auditing)
    explanation TEXT,
    
    -- Model tracking
    model_version VARCHAR(100),
    processing_time_ms INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for real-time queries
CREATE INDEX idx_live_insights_round_id ON live_insights(round_id);
CREATE INDEX idx_live_insights_round_timestamp ON live_insights(round_id, timestamp_ms);
CREATE INDEX idx_live_insights_type ON live_insights(insight_type);
CREATE INDEX idx_live_insights_severity ON live_insights(severity) WHERE severity IN ('HIGH', 'CRITICAL');

-- =============================================================================
-- Fraud Alerts (Subset of insights that are fraud-related)
-- =============================================================================

CREATE TABLE fraud_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    insight_id UUID NOT NULL REFERENCES live_insights(id) ON DELETE CASCADE,
    
    -- Alert details
    alert_type VARCHAR(50) NOT NULL, -- 'MULTIPLE_FACES', 'FACE_SWITCH', 'TAB_SWITCH', 'BACKGROUND_VOICE'
    severity alert_severity NOT NULL,
    
    -- Detection details
    detected_at_ms BIGINT NOT NULL,
    confidence DECIMAL(5, 4) NOT NULL, -- 0.0000 to 1.0000
    
    -- Evidence
    evidence JSONB, -- Frame data, audio snippet reference, etc.
    
    -- Interviewer acknowledgment
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMPTZ,
    false_positive_marked BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fraud_alerts_round_id ON fraud_alerts(round_id);
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(severity);
CREATE INDEX idx_fraud_alerts_unacknowledged ON fraud_alerts(round_id) WHERE acknowledged = FALSE;

-- =============================================================================
-- Interview Transcripts
-- =============================================================================

CREATE TABLE interview_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    
    -- Speaker identification
    speaker VARCHAR(20) NOT NULL CHECK (speaker IN ('CANDIDATE', 'INTERVIEWER')),
    
    -- Content
    content TEXT NOT NULL,
    
    -- Timing
    start_time_ms BIGINT NOT NULL,
    end_time_ms BIGINT NOT NULL,
    
    -- Word-level timestamps for detailed analysis
    word_timestamps JSONB, -- [{"word": "hello", "start": 100, "end": 300, "confidence": 0.98}, ...]
    
    -- STT metadata
    stt_provider VARCHAR(50), -- 'deepgram', 'whisper'
    stt_confidence DECIMAL(5, 4),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcripts_round_id ON interview_transcripts(round_id);
CREATE INDEX idx_transcripts_round_time ON interview_transcripts(round_id, start_time_ms);
CREATE INDEX idx_transcripts_speaker ON interview_transcripts(round_id, speaker);

-- =============================================================================
-- Human Verdicts (Interviewer's final decision)
-- =============================================================================

CREATE TABLE human_verdicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    
    -- Interviewer info
    external_interviewer_id VARCHAR(255) NOT NULL,
    
    -- Decision
    decision verdict_decision NOT NULL,
    overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
    
    -- Detailed scores (optional)
    criteria_scores JSONB, -- {"communication": 4, "technical": 3, "cultural_fit": 5}
    
    -- Notes
    notes TEXT,
    
    -- AI feedback
    ai_insights_helpful BOOLEAN,
    ai_feedback_notes TEXT,
    
    -- Submission
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Only one verdict per round
    CONSTRAINT unique_verdict_per_round UNIQUE (round_id)
);

CREATE INDEX idx_verdicts_round_id ON human_verdicts(round_id);
CREATE INDEX idx_verdicts_interviewer ON human_verdicts(external_interviewer_id);
CREATE INDEX idx_verdicts_decision ON human_verdicts(decision);

-- =============================================================================
-- Interview Summary (Post-interview aggregated report for HR)
-- =============================================================================

CREATE TABLE interview_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    
    -- Aggregated metrics
    avg_speech_confidence DECIMAL(5, 4),
    total_hesitations INTEGER,
    avg_response_latency_ms INTEGER,
    
    -- Fraud summary
    fraud_alerts_count INTEGER DEFAULT 0,
    critical_alerts_count INTEGER DEFAULT 0,
    
    -- Resume analysis
    resume_contradictions_found INTEGER DEFAULT 0,
    contradiction_details JSONB,
    
    -- AI-generated summary
    ai_summary TEXT,
    key_observations JSONB, -- ["Strong communication", "Some hesitation on technical questions", ...]
    
    -- Generated at
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_summary_per_round UNIQUE (round_id)
);

CREATE INDEX idx_summaries_round_id ON interview_summaries(round_id);

-- =============================================================================
-- AI Audit Logs (For explainability and compliance)
-- =============================================================================

CREATE TABLE ai_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID REFERENCES interview_rounds(id) ON DELETE SET NULL,
    
    -- Action details
    service_name VARCHAR(50) NOT NULL, -- 'speech-service', 'video-service', 'fraud-service', 'nlp-service'
    action_type VARCHAR(100) NOT NULL, -- 'ANALYZE_SPEECH', 'DETECT_FACE', 'CHECK_CONTRADICTION'
    
    -- Input/Output (may be redacted for privacy)
    input_summary JSONB, -- Summary of what was analyzed
    output_data JSONB, -- Full output
    
    -- Model info
    model_id VARCHAR(100),
    model_version VARCHAR(50),
    
    -- Performance
    processing_time_ms INTEGER,
    
    -- Status
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_round_id ON ai_audit_logs(round_id);
CREATE INDEX idx_audit_logs_service ON ai_audit_logs(service_name);
CREATE INDEX idx_audit_logs_created ON ai_audit_logs(created_at);

-- =============================================================================
-- Trigger for updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_interview_rounds_updated_at
    BEFORE UPDATE ON interview_rounds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidate_resumes_updated_at
    BEFORE UPDATE ON candidate_resumes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Sample Resume JSON Structure (for reference)
-- =============================================================================

COMMENT ON COLUMN candidate_resumes.resume_json IS '
Expected JSON structure:
{
    "personal_info": {
        "name": "Rahul Sharma",
        "email": "rahul@example.com",
        "phone": "+91-9876543210",
        "location": "Bangalore, India"
    },
    "summary": "Experienced software engineer with 5 years...",
    "experience": [
        {
            "company": "TechCorp India",
            "title": "Senior Software Engineer",
            "start_date": "2022-01",
            "end_date": "present",
            "duration_months": 24,
            "description": "Led team of 5 engineers...",
            "technologies": ["Python", "React", "AWS"]
        },
        {
            "company": "StartupXYZ",
            "title": "Software Engineer",
            "start_date": "2019-06",
            "end_date": "2021-12",
            "duration_months": 30,
            "description": "Full-stack development...",
            "technologies": ["Node.js", "PostgreSQL"]
        }
    ],
    "education": [
        {
            "institution": "IIT Delhi",
            "degree": "B.Tech",
            "field": "Computer Science",
            "graduation_year": 2019,
            "gpa": 8.5
        }
    ],
    "skills": {
        "programming_languages": ["Python", "JavaScript", "Java"],
        "frameworks": ["React", "Django", "FastAPI"],
        "databases": ["PostgreSQL", "MongoDB", "Redis"],
        "tools": ["Docker", "Kubernetes", "AWS"]
    },
    "certifications": [
        {
            "name": "AWS Solutions Architect",
            "issuer": "Amazon",
            "year": 2023
        }
    ],
    "projects": [
        {
            "name": "E-commerce Platform",
            "description": "Built scalable e-commerce...",
            "technologies": ["React", "Node.js", "MongoDB"]
        }
    ]
}
';

-- =============================================================================
-- Resume File Uploads
-- =============================================================================

CREATE TABLE IF NOT EXISTS candidate_resume_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_candidate_id VARCHAR(255) NOT NULL UNIQUE,
    round_id UUID REFERENCES interview_rounds(id) ON DELETE SET NULL,
    
    -- File info
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_resume_files_candidate ON candidate_resume_files(external_candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_resume_files_round ON candidate_resume_files(round_id);

CREATE TRIGGER update_candidate_resume_files_updated_at
    BEFORE UPDATE ON candidate_resume_files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
