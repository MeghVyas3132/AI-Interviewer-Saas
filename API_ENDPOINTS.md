# 📚 AI INTERVIEWER - COMPLETE API DOCUMENTATION

**Base URL**: `http://localhost:8000/api/v1`  
**Authentication**: JWT Bearer Token (except login endpoint)  
**Content-Type**: `application/json`

---

## 🔐 AUTHENTICATION ENDPOINTS

### 1. **Login** (No Auth Required)
```
POST /auth/login
```
**Description**: Authenticate user and receive JWT token

**Request Body**:
```json
{
  "email": "admin@aiinterviewer.com",
  "password": "AdminPass123!@"
}
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Error** (401 Unauthorized):
```json
{
  "detail": "Invalid email or password"
}
```

---

### 2. **Refresh Token**
```
POST /auth/refresh
```
**Description**: Get new access token using refresh token

**Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

---

### 3. **Logout**
```
POST /auth/logout
```
**Description**: Logout user (blacklist token)

**Headers**:
```
Authorization: Bearer {access_token}
```

**Response** (200 OK):
```json
{
  "message": "Logged out successfully"
}
```

---

### 4. **Verify Email**
```
POST /auth/verify-email
```
**Description**: Verify email with verification token

**Request Body**:
```json
{
  "token": "verification_token_here"
}
```

**Response** (200 OK):
```json
{
  "message": "Email verified successfully"
}
```

---

### 5. **Resend Verification Email**
```
POST /auth/resend-verification
```
**Description**: Resend verification email to user

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response** (200 OK):
```json
{
  "message": "Verification email sent"
}
```

---

## 🏢 COMPANY ENDPOINTS

### 1. **Create Company** (Admin Only)
```
POST /company
```
**Description**: Create new company

**Headers**:
```
Authorization: Bearer {admin_token}
```

**Request Body**:
```json
{
  "name": "Google India",
  "email_domain": "googleindia.com",
  "description": "Tech company"
}
```

**Response** (201 Created):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Google India",
  "email_domain": "googleindia.com",
  "description": "Tech company",
  "created_at": "2025-11-16T10:30:00Z",
  "updated_at": "2025-11-16T10:30:00Z"
}
```

---

### 2. **Get Company**
```
GET /company/{company_id}
```
**Description**: Get company details

**Path Parameters**:
- `company_id` (UUID): Company ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Google India",
  "email_domain": "googleindia.com",
  "description": "Tech company",
  "created_at": "2025-11-16T10:30:00Z",
  "updated_at": "2025-11-16T10:30:00Z"
}
```

---

### 3. **Update Company**
```
PUT /company/{company_id}
```
**Description**: Update company details (Admin only)

**Path Parameters**:
- `company_id` (UUID): Company ID

**Headers**:
```
Authorization: Bearer {admin_token}
```

**Request Body**:
```json
{
  "name": "Google India Updated",
  "description": "Updated tech company"
}
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Google India Updated",
  "email_domain": "googleindia.com",
  "description": "Updated tech company",
  "created_at": "2025-11-16T10:30:00Z",
  "updated_at": "2025-11-16T10:35:00Z"
}
```

---

## 👥 USER ENDPOINTS

### 1. **Create User** (HR or Admin)
```
POST /users
```
**Description**: Create new user (employee)

**Headers**:
```
Authorization: Bearer {hr_or_admin_token}
```

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@company.com",
  "password": "SecurePass123!@",
  "role": "EMPLOYEE",
  "department": "Backend"
}
```

**Response** (201 Created):
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "John Doe",
  "email": "john@company.com",
  "role": "EMPLOYEE",
  "department": "Backend",
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-11-16T10:30:00Z",
  "updated_at": "2025-11-16T10:30:00Z"
}
```

---

### 2. **List Users**
```
GET /users
```
**Description**: Get all users in company

**Headers**:
```
Authorization: Bearer {token}
```

**Query Parameters**:
- `role` (optional): Filter by role (ADMIN, HR, EMPLOYEE)
- `department` (optional): Filter by department
- `skip` (optional, default=0): Number of results to skip
- `limit` (optional, default=20): Number of results per page

**Response** (200 OK):
```json
{
  "users": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "John Doe",
      "email": "john@company.com",
      "role": "EMPLOYEE",
      "department": "Backend",
      "company_id": "550e8400-e29b-41d4-a716-446655440000"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### 3. **Get User by ID**
```
GET /users/{user_id}
```
**Description**: Get user details

**Path Parameters**:
- `user_id` (UUID): User ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "John Doe",
  "email": "john@company.com",
  "role": "EMPLOYEE",
  "department": "Backend",
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-11-16T10:30:00Z",
  "updated_at": "2025-11-16T10:30:00Z"
}
```

---

### 4. **Update User** (HR or Admin or Self)
```
PUT /users/{user_id}
```
**Description**: Update user information

**Path Parameters**:
- `user_id` (UUID): User ID

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "name": "John Smith",
  "department": "Frontend"
}
```

**Response** (200 OK):
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "John Smith",
  "email": "john@company.com",
  "role": "EMPLOYEE",
  "department": "Frontend",
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "updated_at": "2025-11-16T10:35:00Z"
}
```

---

### 5. **Delete User** (Admin Only)
```
DELETE /users/{user_id}
```
**Description**: Delete user

**Path Parameters**:
- `user_id` (UUID): User ID

**Headers**:
```
Authorization: Bearer {admin_token}
```

**Response** (204 No Content)

---

### 6. **Change Password**
```
POST /users/{user_id}/change-password
```
**Description**: Change user password

**Path Parameters**:
- `user_id` (UUID): User ID

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "old_password": "CurrentPass123!@",
  "new_password": "NewPass456!@"
}
```

**Response** (200 OK):
```json
{
  "message": "Password changed successfully"
}
```

---

## 👨‍💼 REGISTRATION ENDPOINTS

### 1. **Register HR User** (Admin Initiated)
```
POST /register/user?company_id={company_id}
```
**Description**: Register first HR user for a company

**Path Parameters**:
- `company_id` (UUID, query): Company ID

**Headers**:
```
Authorization: Bearer {admin_token}
```

**Request Body**:
```json
{
  "name": "Jane HR",
  "email": "jane@company.com",
  "password": "SecurePass123!@",
  "role": "HR",
  "department": "Human Resources"
}
```

**Response** (201 Created):
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "name": "Jane HR",
  "email": "jane@company.com",
  "role": "HR",
  "department": "Human Resources",
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "verification_token": "token_sent_to_email",
  "created_at": "2025-11-16T10:30:00Z"
}
```

---

## 👤 CANDIDATE ENDPOINTS

### 1. **Create Candidate**
```
POST /candidates
```
**Description**: Create single candidate

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "email": "alice@gmail.com",
  "first_name": "Alice",
  "last_name": "Kumar",
  "phone": "+91-9876543210",
  "domain": "Backend",
  "position": "Senior Engineer",
  "experience_years": 5,
  "qualifications": "B.Tech, AWS Certified"
}
```

**Response** (201 Created):
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "email": "alice@gmail.com",
  "first_name": "Alice",
  "last_name": "Kumar",
  "phone": "+91-9876543210",
  "domain": "Backend",
  "position": "Senior Engineer",
  "experience_years": 5,
  "qualifications": "B.Tech, AWS Certified",
  "status": "applied",
  "source": "manual",
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-11-16T10:30:00Z"
}
```

---

### 2. **Bulk Import Candidates (JSON)**
```
POST /candidates/bulk/import
```
**Description**: Import multiple candidates from JSON

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "candidates": [
    {
      "email": "alice@gmail.com",
      "first_name": "Alice",
      "last_name": "Kumar",
      "phone": "+91-9876543210",
      "domain": "Backend",
      "status": "applied"
    },
    {
      "email": "bob@gmail.com",
      "first_name": "Bob",
      "last_name": "Singh",
      "phone": "+91-9876543211",
      "domain": "Backend",
      "status": "applied"
    }
  ],
  "send_invitations": true,
  "domain": "Backend"
}
```

**Response** (202 Accepted):
```json
{
  "total": 2,
  "created": 2,
  "failed": 0,
  "errors": [],
  "created_candidates": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "email": "alice@gmail.com",
      "first_name": "Alice",
      "last_name": "Kumar",
      "domain": "Backend",
      "status": "applied"
    }
  ],
  "message": "Imported 2 candidates successfully. 0 errors."
}
```

---

### 3. **Bulk Import Candidates (File)**
```
POST /candidates/bulk/import/file
```
**Description**: Import candidates from Excel/CSV file (Async)

**Headers**:
```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

**Form Parameters**:
- `file` (File, required): Excel (.xlsx) or CSV (.csv) file
- `send_invitations` (boolean, optional, default=true)
- `default_domain` (string, optional): Default domain for all candidates

**Response** (202 Accepted):
```json
{
  "job_id": "990e8400-e29b-41d4-a716-446655440004",
  "status": "queued",
  "message": "Import job queued for processing. Total records: 100",
  "total_records": 100,
  "celery_task_id": "abc123def456"
}
```

---

### 4. **Get Import Job Status**
```
GET /candidates/import-jobs/{job_id}
```
**Description**: Get status of async bulk import job

**Path Parameters**:
- `job_id` (UUID): Import job ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "filename": "candidates.csv",
  "status": "completed",
  "total_records": 100,
  "created_count": 95,
  "failed_count": 5,
  "skipped_count": 0,
  "success_rate": 95.0,
  "processing_duration_seconds": 45,
  "error_message": null,
  "created_at": "2025-11-16T10:30:00Z"
}
```

---

### 5. **Get Candidate by ID**
```
GET /candidates/{candidate_id}
```
**Description**: Get candidate details

**Path Parameters**:
- `candidate_id` (UUID): Candidate ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "email": "alice@gmail.com",
  "first_name": "Alice",
  "last_name": "Kumar",
  "phone": "+91-9876543210",
  "domain": "Backend",
  "status": "applied",
  "source": "excel_import",
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-11-16T10:30:00Z"
}
```

---

### 6. **List Candidates**
```
GET /candidates
```
**Description**: List all candidates with pagination and filters

**Headers**:
```
Authorization: Bearer {token}
```

**Query Parameters**:
- `status` (optional): Filter by status (applied, screening, interview, offer, accepted, hired, rejected)
- `domain` (optional): Filter by domain (Backend, Frontend, DevOps)
- `skip` (optional, default=0): Number of results to skip
- `limit` (optional, default=20): Results per page

**Response** (200 OK):
```json
{
  "candidates": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "email": "alice@gmail.com",
      "first_name": "Alice",
      "last_name": "Kumar",
      "domain": "Backend",
      "status": "applied"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 20
}
```

---

### 7. **Update Candidate**
```
PATCH /candidates/{candidate_id}
```
**Description**: Update candidate information

**Path Parameters**:
- `candidate_id` (UUID): Candidate ID

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "first_name": "Alicia",
  "domain": "Frontend",
  "status": "screening"
}
```

**Response** (200 OK):
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "email": "alice@gmail.com",
  "first_name": "Alicia",
  "domain": "Frontend",
  "status": "screening",
  "updated_at": "2025-11-16T10:35:00Z"
}
```

---

### 8. **Delete Candidate**
```
DELETE /candidates/{candidate_id}
```
**Description**: Delete candidate

**Path Parameters**:
- `candidate_id` (UUID): Candidate ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (204 No Content)

---

### 9. **Bulk Send Email to Candidates**
```
POST /candidates/bulk/send-email
```
**Description**: Send email to multiple candidates

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "candidate_ids": [
    "880e8400-e29b-41d4-a716-446655440003",
    "880e8400-e29b-41d4-a716-446655440004"
  ],
  "template_id": "round_1_results",
  "subject": "Round 1 Results",
  "body": "Congratulations! You've passed round 1."
}
```

**Response** (202 Accepted):
```json
{
  "job_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "status": "202 ACCEPTED",
  "queued_count": 2,
  "estimated_completion": "2025-11-16T10:35:00Z",
  "message": "Queued 2 emails for sending"
}
```

---

### 10. **Get Dashboard Stats**
```
GET /candidates/dashboard/stats
```
**Description**: Get HR dashboard statistics

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "total_candidates": 50,
  "by_status": {
    "applied": 20,
    "screening": 15,
    "interview": 10,
    "offer": 3,
    "accepted": 1,
    "rejected": 1
  },
  "by_domain": {
    "Backend": 15,
    "Frontend": 20,
    "DevOps": 15
  },
  "active_interviews": 10,
  "pending_feedback": 5
}
```

---

### 11. **Get Funnel Analytics**
```
GET /candidates/analytics/funnel
```
**Description**: Get candidate funnel analytics

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "funnel_stages": [
    {
      "stage": "Applied",
      "count": 50,
      "percentage": 100.0
    },
    {
      "stage": "Screening",
      "count": 30,
      "percentage": 60.0,
      "dropoff_from_applied": 40.0
    },
    {
      "stage": "Interview",
      "count": 15,
      "percentage": 30.0,
      "dropoff_from_screening": 50.0
    },
    {
      "stage": "Offer",
      "count": 5,
      "percentage": 10.0,
      "dropoff_from_interview": 66.7
    },
    {
      "stage": "Accepted",
      "count": 3,
      "percentage": 6.0,
      "dropoff_from_offer": 40.0
    }
  ],
  "total_candidates": 50,
  "rejected": 5,
  "overall_acceptance_rate": 60.0
}
```

---

### 12. **Get Time-to-Hire Metrics**
```
GET /candidates/analytics/time-to-hire
```
**Description**: Get time-to-hire metrics

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "average_days_to_hire": 45,
  "median_days_to_hire": 42,
  "by_department": {
    "Backend": 50,
    "Frontend": 40,
    "DevOps": 45
  },
  "recent_hires_count": 3,
  "message": "Average time from applied to hired"
}
```

---

## 📅 INTERVIEW ROUND ENDPOINTS

### 1. **Create Interview Round**
```
POST /interview-rounds
```
**Description**: Schedule interview for candidate

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "candidate_id": "880e8400-e29b-41d4-a716-446655440003",
  "round_type": "SCREENING",
  "scheduled_at": "2025-12-01T10:00:00",
  "timezone": "America/New_York",
  "duration_minutes": 60,
  "interviewer_id": "660e8400-e29b-41d4-a716-446655440001"
}
```

**Response** (201 Created):
```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "candidate_id": "880e8400-e29b-41d4-a716-446655440003",
  "round_type": "SCREENING",
  "status": "scheduled",
  "scheduled_at": "2025-12-01T10:00:00Z",
  "timezone": "America/New_York",
  "duration_minutes": 60,
  "interviewer_id": "660e8400-e29b-41d4-a716-446655440001",
  "created_at": "2025-11-16T10:30:00Z"
}
```

---

### 2. **List Interview Rounds**
```
GET /interview-rounds
```
**Description**: Get all interview rounds

**Headers**:
```
Authorization: Bearer {token}
```

**Query Parameters**:
- `status` (optional): Filter by status (scheduled, completed, cancelled)
- `candidate_id` (optional): Filter by candidate
- `skip` (optional, default=0)
- `limit` (optional, default=20)

**Response** (200 OK):
```json
{
  "interview_rounds": [
    {
      "id": "bb0e8400-e29b-41d4-a716-446655440006",
      "candidate_id": "880e8400-e29b-41d4-a716-446655440003",
      "round_type": "SCREENING",
      "status": "scheduled",
      "scheduled_at": "2025-12-01T10:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### 3. **Get Interview Round by ID**
```
GET /interview-rounds/{interview_id}
```
**Description**: Get interview details

**Path Parameters**:
- `interview_id` (UUID): Interview ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "candidate_id": "880e8400-e29b-41d4-a716-446655440003",
  "round_type": "SCREENING",
  "status": "scheduled",
  "scheduled_at": "2025-12-01T10:00:00Z",
  "timezone": "America/New_York",
  "duration_minutes": 60,
  "interviewer_id": "660e8400-e29b-41d4-a716-446655440001"
}
```

---

### 4. **Update Interview Round**
```
PUT /interview-rounds/{interview_id}
```
**Description**: Update interview details

**Path Parameters**:
- `interview_id` (UUID): Interview ID

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "scheduled_at": "2025-12-02T10:00:00",
  "duration_minutes": 90
}
```

**Response** (200 OK):
```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "candidate_id": "880e8400-e29b-41d4-a716-446655440003",
  "round_type": "SCREENING",
  "scheduled_at": "2025-12-02T10:00:00Z",
  "duration_minutes": 90,
  "updated_at": "2025-11-16T10:35:00Z"
}
```

---

### 5. **Cancel Interview**
```
POST /interview-rounds/{interview_id}/cancel
```
**Description**: Cancel scheduled interview

**Path Parameters**:
- `interview_id` (UUID): Interview ID

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "reason": "Candidate not available"
}
```

**Response** (200 OK):
```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "status": "cancelled",
  "message": "Interview cancelled successfully"
}
```

---

## 💬 INTERVIEW ENDPOINTS (Actual Interviews)

### 1. **Start Interview**
```
POST /interviews/{interview_id}/start
```
**Description**: Mark interview as started

**Path Parameters**:
- `interview_id` (UUID): Interview ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "cc0e8400-e29b-41d4-a716-446655440007",
  "status": "in_progress",
  "started_at": "2025-12-01T10:00:00Z",
  "message": "Interview started"
}
```

---

### 2. **Complete Interview**
```
POST /interviews/{interview_id}/complete
```
**Description**: Mark interview as completed

**Path Parameters**:
- `interview_id` (UUID): Interview ID

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "notes": "Good communication, strong technical skills",
  "rating": 4.5,
  "feedback": "Highly recommended"
}
```

**Response** (200 OK):
```json
{
  "id": "cc0e8400-e29b-41d4-a716-446655440007",
  "status": "completed",
  "completed_at": "2025-12-01T11:00:00Z",
  "rating": 4.5,
  "message": "Interview completed successfully"
}
```

---

## ⭐ SCORE/FEEDBACK ENDPOINTS

### 1. **Create Score/Feedback**
```
POST /scores
```
**Description**: Add interview score and feedback

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "interview_id": "cc0e8400-e29b-41d4-a716-446655440007",
  "rating": 4.5,
  "communication": 5,
  "technical_skills": 4,
  "problem_solving": 4,
  "feedback": "Great candidate",
  "recommendation": "PASS"
}
```

**Response** (201 Created):
```json
{
  "id": "dd0e8400-e29b-41d4-a716-446655440008",
  "interview_id": "cc0e8400-e29b-41d4-a716-446655440007",
  "rating": 4.5,
  "communication": 5,
  "technical_skills": 4,
  "feedback": "Great candidate",
  "recommendation": "PASS",
  "created_at": "2025-11-16T11:30:00Z"
}
```

---

### 2. **Get Score by Interview**
```
GET /scores/{interview_id}
```
**Description**: Get score/feedback for interview

**Path Parameters**:
- `interview_id` (UUID): Interview ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "id": "dd0e8400-e29b-41d4-a716-446655440008",
  "interview_id": "cc0e8400-e29b-41d4-a716-446655440007",
  "rating": 4.5,
  "communication": 5,
  "technical_skills": 4,
  "feedback": "Great candidate",
  "recommendation": "PASS"
}
```

---

### 3. **Update Score**
```
PUT /scores/{score_id}
```
**Description**: Update score and feedback

**Path Parameters**:
- `score_id` (UUID): Score ID

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "rating": 4.8,
  "feedback": "Excellent candidate, highly recommended"
}
```

**Response** (200 OK):
```json
{
  "id": "dd0e8400-e29b-41d4-a716-446655440008",
  "rating": 4.8,
  "feedback": "Excellent candidate, highly recommended",
  "updated_at": "2025-11-16T11:35:00Z"
}
```

---

## 📜 ROLES ENDPOINTS

### 1. **Create Role**
```
POST /roles
```
**Description**: Create custom role (Admin only)

**Headers**:
```
Authorization: Bearer {admin_token}
```

**Request Body**:
```json
{
  "name": "Team Lead",
  "description": "Can manage team members",
  "permissions": [
    "view_candidates",
    "schedule_interviews",
    "submit_feedback"
  ]
}
```

**Response** (201 Created):
```json
{
  "id": "ee0e8400-e29b-41d4-a716-446655440009",
  "name": "Team Lead",
  "description": "Can manage team members",
  "permissions": ["view_candidates", "schedule_interviews"]
}
```

---

### 2. **List Roles**
```
GET /roles
```
**Description**: Get all roles

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "roles": [
    {
      "id": "ee0e8400-e29b-41d4-a716-446655440009",
      "name": "Team Lead",
      "permissions": ["view_candidates"]
    }
  ]
}
```

---

## 📋 AUDIT LOG ENDPOINTS

### 1. **Get Audit Logs**
```
GET /logs
```
**Description**: Get system audit logs

**Headers**:
```
Authorization: Bearer {token}
```

**Query Parameters**:
- `user_id` (optional): Filter by user
- `action` (optional): Filter by action
- `skip` (optional, default=0)
- `limit` (optional, default=20)

**Response** (200 OK):
```json
{
  "logs": [
    {
      "id": "ff0e8400-e29b-41d4-a716-446655440010",
      "user_id": "660e8400-e29b-41d4-a716-446655440001",
      "action": "CREATE_CANDIDATE",
      "resource_type": "Candidate",
      "resource_id": "880e8400-e29b-41d4-a716-446655440003",
      "changes": {"email": "alice@gmail.com"},
      "timestamp": "2025-11-16T10:30:00Z"
    }
  ],
  "total": 100
}
```

---

### 2. **Get User Audit Logs**
```
GET /logs/user/{user_id}
```
**Description**: Get audit logs for specific user

**Path Parameters**:
- `user_id` (UUID): User ID

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "logs": [
    {
      "id": "ff0e8400-e29b-41d4-a716-446655440010",
      "user_id": "660e8400-e29b-41d4-a716-446655440001",
      "action": "CREATE_CANDIDATE",
      "timestamp": "2025-11-16T10:30:00Z"
    }
  ],
  "total": 50
}
```

---

## 📧 EMAIL ENDPOINTS

### 1. **Send Email**
```
POST /email/send
```
**Description**: Send email to candidate or user

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "recipient_email": "alice@gmail.com",
  "subject": "Interview Scheduled",
  "body": "Your interview is scheduled for Dec 1",
  "template_id": "interview_scheduled",
  "variables": {
    "candidate_name": "Alice",
    "interview_date": "Dec 1, 2025"
  }
}
```

**Response** (202 Accepted):
```json
{
  "message": "Email queued for sending",
  "email_id": "gg0e8400-e29b-41d4-a716-446655440011"
}
```

---

## 🏥 HEALTH CHECK

### 1. **Health Status** (No Auth Required)
```
GET /health
```
**Description**: Check backend health and service status

**Response** (200 OK):
```json
{
  "status": "healthy",
  "database": "healthy",
  "redis": "healthy",
  "timestamp": "2025-11-16T10:30:00Z"
}
```

---

## 📊 QUICK REFERENCE TABLE

| Category | Endpoint | Method | Auth | Purpose |
|----------|----------|--------|------|---------|
| **Auth** | `/auth/login` | POST | ❌ | Login |
| | `/auth/refresh` | POST | ✅ | Refresh token |
| | `/auth/logout` | POST | ✅ | Logout |
| **Company** | `/company` | POST | ✅ | Create company |
| | `/company/{id}` | GET | ✅ | Get company |
| | `/company/{id}` | PUT | ✅ | Update company |
| **Users** | `/users` | POST | ✅ | Create user |
| | `/users` | GET | ✅ | List users |
| | `/users/{id}` | GET | ✅ | Get user |
| | `/users/{id}` | PUT | ✅ | Update user |
| | `/users/{id}` | DELETE | ✅ | Delete user |
| **Candidates** | `/candidates` | POST | ✅ | Create candidate |
| | `/candidates/bulk/import` | POST | ✅ | Bulk import JSON |
| | `/candidates/bulk/import/file` | POST | ✅ | Bulk import file |
| | `/candidates` | GET | ✅ | List candidates |
| | `/candidates/{id}` | GET | ✅ | Get candidate |
| | `/candidates/{id}` | PATCH | ✅ | Update candidate |
| | `/candidates/{id}` | DELETE | ✅ | Delete candidate |
| | `/candidates/dashboard/stats` | GET | ✅ | Dashboard stats |
| | `/candidates/analytics/funnel` | GET | ✅ | Funnel analytics |
| | `/candidates/analytics/time-to-hire` | GET | ✅ | TTH metrics |
| **Interviews** | `/interview-rounds` | POST | ✅ | Schedule interview |
| | `/interview-rounds` | GET | ✅ | List interviews |
| | `/interview-rounds/{id}` | GET | ✅ | Get interview |
| | `/interview-rounds/{id}` | PUT | ✅ | Update interview |
| | `/interview-rounds/{id}/cancel` | POST | ✅ | Cancel interview |
| **Scores** | `/scores` | POST | ✅ | Add score |
| | `/scores/{id}` | GET | ✅ | Get score |
| | `/scores/{id}` | PUT | ✅ | Update score |
| **Logs** | `/logs` | GET | ✅ | Get audit logs |
| | `/logs/user/{id}` | GET | ✅ | Get user logs |
| **Email** | `/email/send` | POST | ✅ | Send email |
| **Health** | `/health` | GET | ❌ | Health check |

---

## ✅ ERRORS & STATUS CODES

```json
200 OK - Request successful
201 Created - Resource created
202 Accepted - Request queued (async)
204 No Content - Resource deleted
400 Bad Request - Invalid input
401 Unauthorized - Missing/invalid token
403 Forbidden - Insufficient permissions
404 Not Found - Resource not found
409 Conflict - Resource already exists
422 Unprocessable Entity - Validation failed
429 Too Many Requests - Rate limited
500 Internal Server Error - Server error
```

**Error Response Format**:
```json
{
  "detail": "Error message describing what went wrong"
}
```

---

## 🔑 AUTHENTICATION

All endpoints except `/health`, `/auth/login`, `/auth/verify-email`, `/auth/resend-verification` require JWT token.

**Header Format**:
```
Authorization: Bearer {access_token}
```

**Token Expiration**: 3600 seconds (1 hour)

**To Refresh Token**:
```
POST /api/v1/auth/refresh
Body: { "refresh_token": "..." }
```

---

**End of API Documentation**

For more details, check individual endpoint docstrings in source code.

