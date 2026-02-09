# Interviewer Guide: Using AI-Assisted Interview Features

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-01-30 |
| Audience | Interviewers, Technical Assessors |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Interview Interface Overview](#3-interview-interface-overview)
4. [Real-Time AI Insights](#4-real-time-ai-insights)
5. [Candidate Resume Access](#5-candidate-resume-access)
6. [Fraud Detection Alerts](#6-fraud-detection-alerts)
7. [Submitting Verdict](#7-submitting-verdict)
8. [Best Practices](#8-best-practices)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Introduction

This guide explains how to effectively use the AI-assisted interview features during candidate interviews. The AI provides real-time insights to support your evaluation while you maintain full control over the interview process.

### 1.1 What AI Provides

- Real-time speech confidence analysis
- Engagement and sentiment tracking
- NLP-based answer quality metrics
- Follow-up question suggestions
- Fraud detection alerts

### 1.2 What AI Does Not Do

- Make hiring decisions for you
- Record without your knowledge
- Replace human judgment
- Access candidate personal data beyond resume

---

## 2. Getting Started

### 2.1 Accessing Your Interview

1. Click the interview link sent by HR
2. You will be directed to the Interviewer Interview page
3. Review the candidate information displayed
4. Wait in the lobby until the candidate joins

### 2.2 Pre-Interview Checklist

| Item | Verification |
|------|--------------|
| Camera | Working and positioned correctly |
| Microphone | Working and clear audio |
| Internet | Stable connection |
| Environment | Professional background, minimal noise |
| Resume | Reviewed candidate resume |
| Questions | Prepared interview questions |

### 2.3 Joining the Interview

1. Click "Join Interview"
2. Allow camera and microphone permissions when prompted
3. Verify your video and audio are working
4. Wait for the candidate to join
5. Interview begins when both parties are present

---

## 3. Interview Interface Overview

### 3.1 Interface Layout

```
+--------------------------------------------------+
|  Interview Controls (Top Bar)                     |
|  [Mic] [Camera] [Screen Share] [End]             |
+--------------------------------------------------+
|                    |                              |
|   Video Feed       |   AI Insights Panel         |
|   (Candidate)      |   - Confidence Score        |
|                    |   - Sentiment               |
|                    |   - Speaking Stats          |
+--------------------------------------------------+
|                    |                              |
|   Your Video       |   Resume Panel              |
|   (Small)          |   (Scrollable PDF)          |
|                    |                              |
+--------------------------------------------------+
|  Fraud Alerts Banner (appears when detected)     |
+--------------------------------------------------+
```

### 3.2 Control Functions

| Control | Function | Keyboard Shortcut |
|---------|----------|-------------------|
| Microphone | Mute/unmute your audio | M |
| Camera | Enable/disable your video | V |
| Screen Share | Share your screen | S |
| End Call | Terminate the interview | - |
| Toggle Insights | Show/hide AI panel | I |

---

## 4. Real-Time AI Insights

### 4.1 Insights Panel Components

The AI Insights panel updates in real-time during the interview.

#### Confidence Score

| Score Range | Interpretation |
|-------------|----------------|
| 80-100% | High confidence, clear communication |
| 60-79% | Moderate confidence, some hesitation |
| 40-59% | Low confidence, uncertain responses |
| 0-39% | Very low confidence, requires follow-up |

#### Sentiment Analysis

| Indicator | Meaning |
|-----------|---------|
| Positive | Candidate appears engaged and positive |
| Neutral | Balanced emotional state |
| Negative | Candidate appears stressed or frustrated |

#### Speaking Statistics

- Words per minute (WPM)
- Filler word count ("um", "uh", "like")
- Pause duration patterns
- Response latency

### 4.2 Interpreting AI Insights

| Insight | Potential Action |
|---------|------------------|
| Dropping confidence | Rephrase question, provide context |
| High filler count | Allow more thinking time |
| Long pauses | Question may be unclear |
| Negative sentiment | Check candidate comfort |
| Low engagement | Ask more interactive questions |

### 4.3 AI-Suggested Follow-ups

The AI may suggest follow-up questions based on:

- Technical depth of answers
- Areas requiring clarification
- Missing competency coverage
- Response quality gaps

These appear as suggestions. You decide whether to use them.

---

## 5. Candidate Resume Access

### 5.1 Viewing the Resume

The candidate uploads their resume before joining the interview. The resume displays in the Resume Panel on the right side of the interface.

Features:
- Scrollable PDF viewer
- Zoom in/out capability
- Full-screen option

### 5.2 Using Resume During Interview

1. Reference specific sections during discussion
2. Verify experience claims mentioned verbally
3. Ask clarifying questions about resume content
4. Note discrepancies for follow-up

### 5.3 Resume Not Visible

If the resume panel shows an error:
- Candidate may not have uploaded a resume
- File may be processing (wait a few seconds)
- Contact HR if issue persists

---

## 6. Fraud Detection Alerts

### 6.1 Understanding Alerts

The system monitors for potential integrity issues. Alerts appear as a banner at the bottom of the screen.

| Alert Type | What It Means | Suggested Action |
|------------|---------------|------------------|
| TAB_SWITCH | Candidate navigated away from interview tab | Ask what they were looking at |
| MULTIPLE_FACES | More than one person detected on camera | Request candidate confirms they are alone |
| BACKGROUND_VOICE | Unidentified voice detected | Inquire about the voice |
| FACE_SWITCH | Primary face appears different | Verify candidate identity |
| SCREEN_PROMPT | Potential external assistance detected | Ask candidate to show environment |

### 6.2 Responding to Alerts

1. Note the alert timestamp
2. Observe candidate behavior
3. Address naturally if appropriate
4. Document in verdict notes
5. Do not accuse without context

### 6.3 Alert Severity

| Severity | Response |
|----------|----------|
| LOW | Monitor, no immediate action |
| MEDIUM | Note for verdict, may inquire |
| HIGH | Address during interview |
| CRITICAL | Consider pausing interview |

---

## 7. Submitting Verdict

### 7.1 Accessing Verdict Form

After the interview:
1. Click "Submit Verdict" or navigate to Verdict page
2. Review interview summary
3. Complete the verdict form

### 7.2 Verdict Options

| Decision | Use When |
|----------|----------|
| ADVANCE | Candidate should proceed to next round |
| REJECT | Candidate is not suitable for the role |
| HOLD | Need more information before deciding |
| REASSESS | Schedule another interview for this round |

### 7.3 Verdict Form Fields

| Field | Required | Description |
|-------|----------|-------------|
| Decision | Yes | Select ADVANCE, REJECT, HOLD, or REASSESS |
| Confidence | Yes | Your confidence level (1-5) |
| Technical Score | Depends | Technical competency rating |
| Communication Score | Depends | Communication skills rating |
| Overall Score | Yes | Overall candidate rating |
| Notes | Yes | Detailed feedback and observations |
| Recommendation | No | Suggestions for next round |

### 7.4 Best Practices for Verdicts

- Submit verdict immediately after interview
- Reference specific examples from the interview
- Note AI insights that influenced assessment
- Document any fraud alerts observed
- Be objective and fact-based

---

## 8. Best Practices

### 8.1 Using AI Insights Effectively

| Do | Do Not |
|----|--------|
| Use insights as additional data points | Rely solely on AI scores |
| Correlate insights with observations | Ignore your own judgment |
| Note significant insight changes | Fixate on momentary fluctuations |
| Reference insights in verdict | Let AI replace critical thinking |

### 8.2 Interview Conduct

- Allow 2-3 seconds after questions for processing
- Watch both the candidate and insights panel
- Address fraud alerts professionally
- Keep AI suggestions as optional tools

### 8.3 Technical Interview Tips

With AI assistance:
1. Start with resume-based questions
2. Progress to technical scenarios
3. Monitor confidence during problem-solving
4. Use AI follow-up suggestions for depth
5. Note engagement changes on difficult topics

---

## 9. Troubleshooting

### 9.1 Common Issues

| Issue | Resolution |
|-------|------------|
| Cannot join interview | Refresh page, check internet |
| Video not showing | Check browser camera permissions |
| Audio not working | Check browser microphone permissions |
| AI insights not updating | Page refresh may be needed |
| Resume not loading | Candidate may not have uploaded |
| Interview link expired | Contact HR for new link |

### 9.2 During Interview Issues

| Issue | Action |
|-------|--------|
| Candidate audio drops | Ask to rejoin or check connection |
| Your video freezes | Brief camera toggle off/on |
| AI panel disappears | Toggle with "I" key |
| Screen share fails | Try sharing specific window instead |

### 9.3 Emergency Contacts

- Technical Support: IT Help Desk
- HR Escalation: Assigned HR coordinator
- System Status: Check status page

---

## Appendix: Quick Reference Card

### Interview Flow

```
1. Click interview link
2. Review candidate info
3. Join meeting room
4. Wait for candidate
5. Conduct interview
6. Monitor AI insights
7. Address fraud alerts if needed
8. End call
9. Submit verdict
```

### Key Shortcuts

| Key | Action |
|-----|--------|
| M | Toggle microphone |
| V | Toggle video |
| S | Toggle screen share |
| I | Toggle AI insights panel |

### AI Score Quick Reference

| Score | Quality |
|-------|---------|
| 90+ | Excellent |
| 70-89 | Good |
| 50-69 | Average |
| 30-49 | Below Average |
| <30 | Poor |

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial version |
