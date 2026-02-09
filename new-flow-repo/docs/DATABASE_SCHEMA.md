# Database Schema Documentation

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-01-30 |
| Database | PostgreSQL 15+ |

---

## Table of Contents

1. [Entity Relationship Diagram](#1-entity-relationship-diagram)
2. [Table Definitions](#2-table-definitions)
3. [Indexes](#3-indexes)
4. [Foreign Key Relationships](#4-foreign-key-relationships)
5. [Enumerations](#5-enumerations)

---

## 1. Entity Relationship Diagram

```
+------------------+       +----------------------+       +------------------+
|    interviews    |       |   interview_rounds   |       |     verdicts     |
+------------------+       +----------------------+       +------------------+
| id (PK)          |<---+  | id (PK)              |------>| id (PK)          |
| external_        |    |  | interview_id (FK)    |       | round_id (FK)    |
|   candidate_id   |    +--| external_candidate_id|       | interviewer_id   |
| job_role_id      |       | interviewer_id       |       | decision         |
| status           |       | job_role_id          |       | confidence       |
| created_at       |       | round_number         |       | technical_score  |
| updated_at       |       | round_type           |       | communication_   |
+------------------+       | interview_mode       |       |   score          |
                           | status               |       | overall_score    |
                           | scheduled_at         |       | notes            |
                           | started_at           |       | recommendation   |
                           | ended_at             |       | created_at       |
                           | duration_minutes     |       | updated_at       |
                           | meeting_id           |       +------------------+
                           | meeting_token        |
                           | created_at           |
                           | updated_at           |
                           +----------------------+
                                    |
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
+---------------------------+       +---------------------------+
| candidate_resume_files    |       |      ai_insights          |
+---------------------------+       +---------------------------+
| id (PK)                   |       | id (PK)                   |
| external_candidate_id     |       | round_id (FK)             |
| round_id (FK)             |       | insight_type              |
| file_name                 |       | timestamp                 |
| file_path                 |       | data (JSONB)              |
| file_url                  |       | created_at                |
| mime_type                 |       +---------------------------+
| created_at                |
| updated_at                |
+---------------------------+
                                    +---------------------------+
                                    |      fraud_alerts         |
                                    +---------------------------+
                                    | id (PK)                   |
                                    | round_id (FK)             |
                                    | alert_type                |
                                    | severity                  |
                                    | timestamp                 |
                                    | details                   |
                                    | created_at                |
                                    +---------------------------+
```

---

## 2. Table Definitions

### 2.1 interviews

Parent table for interview processes.

```sql
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_candidate_id VARCHAR(255) NOT NULL,
    job_role_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | gen_random_uuid() | Primary key |
| external_candidate_id | VARCHAR(255) | No | - | External candidate reference |
| job_role_id | UUID | No | - | Reference to job role |
| status | VARCHAR(50) | No | 'ACTIVE' | Interview status |
| created_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Last update timestamp |

### 2.2 interview_rounds

Individual interview rounds within an interview.

```sql
CREATE TABLE interview_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    external_candidate_id VARCHAR(255) NOT NULL,
    interviewer_id UUID,
    job_role_id UUID NOT NULL,
    round_number INTEGER NOT NULL,
    round_type VARCHAR(50) NOT NULL,
    interview_mode VARCHAR(50) NOT NULL DEFAULT 'HUMAN_AI_ASSISTED',
    status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    meeting_id VARCHAR(255),
    meeting_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(interview_id, round_number)
);
```

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | gen_random_uuid() | Primary key |
| interview_id | UUID | No | - | Reference to parent interview |
| external_candidate_id | VARCHAR(255) | No | - | External candidate reference |
| interviewer_id | UUID | Yes | - | Assigned interviewer |
| job_role_id | UUID | No | - | Reference to job role |
| round_number | INTEGER | No | - | Sequential round number |
| round_type | VARCHAR(50) | No | - | Type of interview round |
| interview_mode | VARCHAR(50) | No | 'HUMAN_AI_ASSISTED' | Interview mode |
| status | VARCHAR(50) | No | 'SCHEDULED' | Round status |
| scheduled_at | TIMESTAMPTZ | Yes | - | Scheduled start time |
| started_at | TIMESTAMPTZ | Yes | - | Actual start time |
| ended_at | TIMESTAMPTZ | Yes | - | Actual end time |
| duration_minutes | INTEGER | No | 60 | Expected duration |
| meeting_id | VARCHAR(255) | Yes | - | VideoSDK room ID |
| meeting_token | TEXT | Yes | - | Room creation token |
| created_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Last update timestamp |

### 2.3 candidate_resume_files

Stores resume file metadata for candidates.

```sql
CREATE TABLE candidate_resume_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_candidate_id VARCHAR(255) NOT NULL,
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | gen_random_uuid() | Primary key |
| external_candidate_id | VARCHAR(255) | No | - | External candidate reference |
| round_id | UUID | No | - | Reference to interview round |
| file_name | VARCHAR(255) | No | - | Original file name |
| file_path | TEXT | No | - | Server file path |
| file_url | TEXT | No | - | API URL for file access |
| mime_type | VARCHAR(100) | No | 'application/pdf' | File MIME type |
| created_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Upload timestamp |
| updated_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Last update timestamp |

### 2.4 verdicts

Interview verdict and feedback.

```sql
CREATE TABLE verdicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL UNIQUE REFERENCES interview_rounds(id) ON DELETE CASCADE,
    interviewer_id UUID NOT NULL,
    decision VARCHAR(50) NOT NULL,
    confidence INTEGER NOT NULL CHECK (confidence >= 1 AND confidence <= 5),
    technical_score INTEGER CHECK (technical_score >= 0 AND technical_score <= 100),
    communication_score INTEGER CHECK (communication_score >= 0 AND communication_score <= 100),
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    notes TEXT NOT NULL,
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | gen_random_uuid() | Primary key |
| round_id | UUID | No | - | Reference to interview round |
| interviewer_id | UUID | No | - | Interviewer who submitted |
| decision | VARCHAR(50) | No | - | Verdict decision |
| confidence | INTEGER | No | - | Confidence level (1-5) |
| technical_score | INTEGER | Yes | - | Technical rating (0-100) |
| communication_score | INTEGER | Yes | - | Communication rating (0-100) |
| overall_score | INTEGER | No | - | Overall rating (0-100) |
| notes | TEXT | No | - | Detailed feedback |
| recommendation | TEXT | Yes | - | Next steps recommendation |
| created_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Submission timestamp |
| updated_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Last update timestamp |

### 2.5 ai_insights

Stores AI-generated insights during interviews.

```sql
CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | gen_random_uuid() | Primary key |
| round_id | UUID | No | - | Reference to interview round |
| insight_type | VARCHAR(50) | No | - | Type of insight |
| timestamp | TIMESTAMPTZ | No | - | Insight generation time |
| data | JSONB | No | - | Insight data payload |
| created_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Storage timestamp |

### 2.6 fraud_alerts

Stores fraud detection events.

```sql
CREATE TABLE fraud_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | No | gen_random_uuid() | Primary key |
| round_id | UUID | No | - | Reference to interview round |
| alert_type | VARCHAR(50) | No | - | Type of alert |
| severity | VARCHAR(20) | No | - | Alert severity level |
| timestamp | TIMESTAMPTZ | No | - | Detection timestamp |
| details | TEXT | Yes | - | Additional information |
| created_at | TIMESTAMPTZ | No | CURRENT_TIMESTAMP | Storage timestamp |

---

## 3. Indexes

```sql
-- interview_rounds indexes
CREATE INDEX idx_rounds_interview ON interview_rounds(interview_id);
CREATE INDEX idx_rounds_candidate ON interview_rounds(external_candidate_id);
CREATE INDEX idx_rounds_interviewer ON interview_rounds(interviewer_id);
CREATE INDEX idx_rounds_status ON interview_rounds(status);
CREATE INDEX idx_rounds_scheduled ON interview_rounds(scheduled_at);

-- candidate_resume_files indexes
CREATE INDEX idx_resume_round ON candidate_resume_files(round_id);
CREATE INDEX idx_resume_candidate ON candidate_resume_files(external_candidate_id);

-- verdicts indexes
CREATE INDEX idx_verdicts_interviewer ON verdicts(interviewer_id);
CREATE INDEX idx_verdicts_decision ON verdicts(decision);

-- ai_insights indexes
CREATE INDEX idx_insights_round ON ai_insights(round_id);
CREATE INDEX idx_insights_type ON ai_insights(insight_type);
CREATE INDEX idx_insights_timestamp ON ai_insights(round_id, timestamp);

-- fraud_alerts indexes
CREATE INDEX idx_fraud_round ON fraud_alerts(round_id);
CREATE INDEX idx_fraud_severity ON fraud_alerts(severity);
CREATE INDEX idx_fraud_timestamp ON fraud_alerts(round_id, timestamp);
```

---

## 4. Foreign Key Relationships

| Child Table | Column | Parent Table | Column | On Delete |
|-------------|--------|--------------|--------|-----------|
| interview_rounds | interview_id | interviews | id | CASCADE |
| candidate_resume_files | round_id | interview_rounds | id | CASCADE |
| verdicts | round_id | interview_rounds | id | CASCADE |
| ai_insights | round_id | interview_rounds | id | CASCADE |
| fraud_alerts | round_id | interview_rounds | id | CASCADE |

---

## 5. Enumerations

### interview_mode

| Value | Description |
|-------|-------------|
| AI_CONDUCTED | Fully automated AI interview |
| HUMAN_AI_ASSISTED | Human interviewer with AI support |
| HUMAN_ONLY | Traditional human interview |

### round_type

| Value | Description |
|-------|-------------|
| TECHNICAL_AI | AI-conducted technical assessment |
| SCREENING_HUMAN | Initial HR screening |
| HR_HUMAN | HR interview round |
| MANAGERIAL_HUMAN | Hiring manager interview |
| CULTURAL_FIT_HUMAN | Cultural fit assessment |

### round_status

| Value | Description |
|-------|-------------|
| SCHEDULED | Round created, waiting for start |
| WAITING_FOR_CANDIDATE | Interviewer joined, waiting for candidate |
| WAITING_FOR_INTERVIEWER | Candidate joined, waiting for interviewer |
| IN_PROGRESS | Interview active |
| COMPLETED | Interview finished |
| CANCELLED | Interview cancelled |
| NO_SHOW | Participant did not join |

### verdict_decision

| Value | Description |
|-------|-------------|
| ADVANCE | Proceed to next round |
| REJECT | End candidacy |
| HOLD | Defer decision |
| REASSESS | Schedule another interview |

### alert_severity

| Value | Description |
|-------|-------------|
| LOW | Monitor, no action required |
| MEDIUM | Notable, may require follow-up |
| HIGH | Significant concern |
| CRITICAL | Immediate attention required |

### insight_type

| Value | Description |
|-------|-------------|
| speech_analysis | Speech confidence and sentiment |
| nlp_analysis | Answer quality and relevance |
| engagement_analysis | Engagement and attention metrics |
| video_analysis | Visual analysis results |

---

## Migration Script

For adding new tables to existing schema:

```sql
-- Add candidate_resume_files table
CREATE TABLE IF NOT EXISTS candidate_resume_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_candidate_id VARCHAR(255) NOT NULL,
    round_id UUID NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_resume_round ON candidate_resume_files(round_id);
CREATE INDEX IF NOT EXISTS idx_resume_candidate ON candidate_resume_files(external_candidate_id);
```

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial version with resume files table |
