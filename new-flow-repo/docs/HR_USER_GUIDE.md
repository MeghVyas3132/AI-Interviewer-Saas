# HR User Guide: Scheduling AI-Assisted Interviews

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-01-30 |
| Audience | HR Personnel, Hiring Managers |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Creating an Interview Round](#3-creating-an-interview-round)
4. [Managing Interview Rounds](#4-managing-interview-rounds)
5. [Monitoring Active Interviews](#5-monitoring-active-interviews)
6. [Reviewing Interview Results](#6-reviewing-interview-results)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Introduction

The AI Interview Assistant enhances the traditional interview process by providing real-time AI-powered insights to interviewers. This guide explains how HR personnel can schedule and manage AI-assisted interview rounds.

### 1.1 Interview Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| AI_CONDUCTED | Fully automated AI interview | Initial screening, high-volume hiring |
| HUMAN_AI_ASSISTED | Human interviewer with AI insights | Technical rounds, final interviews |
| HUMAN_ONLY | Traditional interview without AI | Sensitive discussions, executive roles |

### 1.2 Round Types

| Type | Description |
|------|-------------|
| TECHNICAL_AI | AI-conducted technical assessment |
| SCREENING_HUMAN | Initial HR screening with human |
| HR_HUMAN | HR round with human interviewer |
| MANAGERIAL_HUMAN | Hiring manager interview |
| CULTURAL_FIT_HUMAN | Cultural fit assessment |

---

## 2. Prerequisites

Before scheduling an interview, ensure:

1. Candidate profile exists in the system
2. Job role is defined with required competencies
3. Interviewer is assigned and available
4. Candidate has been notified of the interview process

---

## 3. Creating an Interview Round

### 3.1 Step-by-Step Process

1. Navigate to HR Dashboard
2. Select the candidate from the candidate list
3. Click "Schedule Interview Round"
4. Complete the interview form:

| Field | Required | Description |
|-------|----------|-------------|
| Interview ID | Yes | Reference to the parent interview |
| Candidate | Yes | Select from candidate list |
| Interviewer | No* | Assign interviewer (required for HUMAN modes) |
| Job Role | Yes | Position being interviewed for |
| Round Number | Yes | Sequential round number (1, 2, 3...) |
| Round Type | Yes | Select from available types |
| Interview Mode | Yes | Select AI_CONDUCTED, HUMAN_AI_ASSISTED, or HUMAN_ONLY |
| Scheduled Date/Time | Yes | Interview start time |
| Duration | Yes | Expected duration in minutes |

5. Click "Create Interview Round"
6. System generates VideoSDK meeting room automatically
7. Interview links are generated for both candidate and interviewer

### 3.2 Interview Links

After creation, the system provides:

- Candidate Interview URL: `https://app.example.com/candidate/interview/{roundId}`
- Interviewer Interview URL: `https://app.example.com/interviewer/interview/{roundId}`

Send the appropriate link to each participant.

---

## 4. Managing Interview Rounds

### 4.1 Viewing Scheduled Interviews

Access the interview management dashboard to see:

- All scheduled interviews
- Interview status (Scheduled, In Progress, Completed, Cancelled)
- Assigned interviewers
- Candidate information

### 4.2 Modifying an Interview

You can modify the following before an interview starts:

- Scheduled date and time
- Assigned interviewer
- Duration

To modify:
1. Select the interview round
2. Click "Edit"
3. Update the required fields
4. Save changes

### 4.3 Cancelling an Interview

To cancel an interview:
1. Select the interview round
2. Click "Cancel Interview"
3. Provide cancellation reason
4. Confirm cancellation

The system will:
- Update status to CANCELLED
- Notify the candidate (if notifications enabled)
- Notify the interviewer (if notifications enabled)
- Release the VideoSDK room

### 4.4 Rescheduling an Interview

To reschedule:
1. Cancel the existing round
2. Create a new round with updated timing
3. New meeting credentials are generated

---

## 5. Monitoring Active Interviews

### 5.1 Interview Status Dashboard

Monitor active interviews in real-time:

| Status | Description |
|--------|-------------|
| SCHEDULED | Interview created, waiting for start time |
| WAITING_FOR_CANDIDATE | Interviewer joined, candidate not yet present |
| WAITING_FOR_INTERVIEWER | Candidate joined, interviewer not yet present |
| IN_PROGRESS | Both participants present, interview active |
| COMPLETED | Interview finished, verdict may be pending |
| NO_SHOW | Participant did not join within grace period |

### 5.2 Live Metrics (During Interview)

For HUMAN_AI_ASSISTED interviews, HR can view:

- Interview duration
- Number of AI insights generated
- Fraud alerts (if any)
- Participant connection status

---

## 6. Reviewing Interview Results

### 6.1 Accessing Interview Results

After an interview completes:

1. Navigate to the interview round
2. Click "View Results"
3. Access the following sections:
   - Interviewer Verdict
   - AI Insights Summary
   - Fraud Detection Report
   - Transcript (if enabled)

### 6.2 Understanding the Verdict

| Decision | Meaning |
|----------|---------|
| ADVANCE | Proceed to next round |
| REJECT | End candidacy |
| HOLD | Defer decision, may reassess |
| REASSESS | Schedule another interview |

### 6.3 AI Insights Summary

The AI provides:

- Speech confidence score (0-100%)
- Engagement score (0-100%)
- Response quality metrics
- Areas of concern flagged
- Follow-up question recommendations

### 6.4 Fraud Detection Report

Review any flagged incidents:

| Alert Type | Description | Severity |
|------------|-------------|----------|
| TAB_SWITCH | Candidate left interview tab | Medium |
| MULTIPLE_FACES | More than one face detected | High |
| BACKGROUND_VOICE | Unidentified voice in background | Medium |
| FACE_SWITCH | Primary face changed during interview | Critical |

---

## 7. Troubleshooting

### 7.1 Common Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| Interview link not working | Round not created properly | Verify round exists, regenerate if needed |
| Candidate cannot join | VideoSDK room expired | Create new round |
| AI insights not appearing | ML services unavailable | Check system status, escalate to IT |
| Video not loading | Browser permissions | Candidate needs to allow camera/mic |

### 7.2 Escalation Path

For technical issues:
1. Check system status page
2. Contact IT Support
3. If urgent, create high-priority ticket

### 7.3 Data Retention

| Data Type | Retention Period |
|-----------|------------------|
| Interview recordings | 90 days |
| AI insights | 1 year |
| Verdicts | Permanent |
| Resume files | Until candidate deletion |

---

## Appendix: Quick Reference

### Interview Creation Checklist

- [ ] Candidate profile verified
- [ ] Interviewer assigned and confirmed
- [ ] Job role selected correctly
- [ ] Interview mode appropriate for round type
- [ ] Date and time confirmed with all parties
- [ ] Interview links distributed

### Interview Completion Checklist

- [ ] Verify interview status is COMPLETED
- [ ] Confirm verdict has been submitted
- [ ] Review AI insights summary
- [ ] Check for any fraud alerts
- [ ] Update candidate status in main system
- [ ] Notify candidate of next steps

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial version |
