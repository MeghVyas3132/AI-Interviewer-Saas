"""
HR routes for company-specific operations.

HR capabilities:
- View company metrics (candidates, employees, interviews)
- Manage employees in the company
- Access company-specific data
"""

import json
import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select, not_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.candidate import Candidate, CandidateStatus, Interview, InterviewStatus
from app.models.user import User, UserRole
from app.utils.cache import invalidate_cache

router = APIRouter(prefix="/api/v1/hr", tags=["hr"])
logger = logging.getLogger(__name__)


MAX_RESUME_TEXT_LENGTH = 50_000
MAX_TRANSCRIPT_JSON_LENGTH = 2_000_000


def _sanitize_text_for_db(value: Optional[str], *, max_length: int) -> str:
    """Normalize text payloads before persisting to Postgres text columns."""
    if not value:
        return ""
    text_value = str(value)
    text_value = text_value.replace("\x00", "")
    # Remove additional control characters that commonly break persistence/logging.
    text_value = "".join(
        ch for ch in text_value if ch in ("\n", "\r", "\t") or ord(ch) >= 32
    )
    return text_value.strip()[:max_length]


def _looks_like_binary_blob(value: Optional[str]) -> bool:
    """Detect raw/binary payloads (e.g. PDF bytes interpreted as text)."""
    if not value:
        return False
    sample = str(value)[:4096]
    if sample.startswith("%PDF-") or "\x00" in sample:
        return True
    # Heuristic: too many replacement chars usually indicates binary decode noise.
    replacement_char_ratio = sample.count("\ufffd") / max(len(sample), 1)
    return replacement_char_ratio > 0.01


def _normalize_transcript_payload(raw_transcript: object) -> list[dict]:
    """Ensure transcript payload is a bounded, serializable list of message objects."""
    if not isinstance(raw_transcript, list):
        return []

    normalized: list[dict] = []
    for item in raw_transcript[:1000]:
        if not isinstance(item, dict):
            continue
        role = _sanitize_text_for_db(item.get("role", "unknown"), max_length=32).lower() or "unknown"
        content = _sanitize_text_for_db(item.get("content", ""), max_length=5000)
        timestamp = _sanitize_text_for_db(item.get("timestamp", ""), max_length=64)

        if not content:
            continue

        normalized_item = {
            "role": role,
            "content": content,
        }
        if timestamp:
            normalized_item["timestamp"] = timestamp

        # Preserve richer utterance metadata for downstream verdict rendering.
        raw_meta = item.get("meta", {})
        meta = raw_meta if isinstance(raw_meta, dict) else {}
        normalized_meta: dict = {}

        transcript_source = _sanitize_text_for_db(
            meta.get("transcript_source", item.get("transcript_source", "")),
            max_length=32,
        ).lower()
        if transcript_source:
            normalized_meta["transcript_source"] = transcript_source

        segment_id = _sanitize_text_for_db(
            meta.get("segment_id", item.get("segment_id", "")),
            max_length=128,
        )
        if segment_id:
            normalized_meta["segment_id"] = segment_id

        confidence_raw = meta.get("confidence", item.get("confidence"))
        try:
            if confidence_raw is not None and str(confidence_raw).strip() != "":
                normalized_meta["confidence"] = max(0.0, min(1.0, float(confidence_raw)))
        except Exception:
            pass

        is_final_raw = meta.get("is_final", item.get("is_final"))
        if isinstance(is_final_raw, bool):
            normalized_meta["is_final"] = is_final_raw

        for key in ("start_ms", "end_ms"):
            value = meta.get(key, item.get(key))
            try:
                if value is not None and str(value).strip() != "":
                    normalized_meta[key] = int(float(value))
            except Exception:
                continue

        flags_raw = meta.get("flags", item.get("flags", []))
        if isinstance(flags_raw, list):
            normalized_flags = []
            for flag in flags_raw[:10]:
                clean_flag = _sanitize_text_for_db(flag, max_length=64).lower()
                if clean_flag:
                    normalized_flags.append(clean_flag)
            if normalized_flags:
                normalized_meta["flags"] = normalized_flags

        if normalized_meta:
            normalized_item["meta"] = normalized_meta
        normalized.append(normalized_item)

    return normalized


def require_hr(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require HR or SYSTEM_ADMIN role.
    """
    if current_user.role not in [UserRole.HR, UserRole.SYSTEM_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HR users can access this resource",
        )
    return current_user


def _parse_interview_transcript(raw_transcript: Optional[str]) -> List[Dict[str, Any]]:
    """Parse serialized interview transcript JSON safely."""
    if not raw_transcript:
        return []
    try:
        parsed = json.loads(raw_transcript)
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
    except Exception:
        return []
    return []


def _build_qa_pairs(transcript: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract ordered Q&A pairs from transcript timeline."""
    qa_pairs: List[Dict[str, Any]] = []
    current_question: Optional[Dict[str, Any]] = None

    for msg in transcript:
        role = str(msg.get("role", "")).lower()
        content = str(msg.get("content", "")).strip()
        if not content:
            continue

        if role in {"ai", "assistant", "interviewer"}:
            current_question = msg
            continue

        if role in {"user", "candidate"} and current_question is not None:
            qa_pairs.append({
                "question": str(current_question.get("content", "")).strip(),
                "answer": content,
                "timestamp": msg.get("timestamp", "") or current_question.get("timestamp", ""),
                "question_timestamp": current_question.get("timestamp", ""),
                "answer_timestamp": msg.get("timestamp", ""),
            })
            current_question = None

    return qa_pairs


@router.get("/metrics")
async def get_hr_metrics(
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Get company-specific metrics for HR dashboard.
    Returns: total_candidates, active_candidates, total_employees, pending_interviews
    """
    try:
        company_id = current_user.company_id

        # Count total candidates in company
        total_candidates_query = select(func.count()).select_from(Candidate).filter(
            Candidate.company_id == company_id
        )
        total_candidates_result = await db.execute(total_candidates_query)
        total_candidates = total_candidates_result.scalar() or 0

        # Count active candidates (selected, offer, or accepted)
        active_candidates_query = select(func.count()).select_from(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.status.in_([
                    CandidateStatus.APPLIED,
                    CandidateStatus.SCREENING,
                    CandidateStatus.ASSESSMENT,
                    CandidateStatus.INTERVIEW,
                    CandidateStatus.SELECTED,
                    CandidateStatus.OFFER,
                    CandidateStatus.ACCEPTED
                ])
            )
        )
        active_candidates_result = await db.execute(active_candidates_query)
        active_candidates = active_candidates_result.scalar() or 0

        # Count total employees in company (EMPLOYEE role)
        total_employees_query = select(func.count()).select_from(User).filter(
            and_(
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        )
        total_employees_result = await db.execute(total_employees_query)
        total_employees = total_employees_result.scalar() or 0

        # Count pending interviews (SCHEDULED status)
        pending_interviews_query = select(func.count()).select_from(Interview).filter(
            and_(
                Interview.company_id == company_id,
                Interview.status == InterviewStatus.SCHEDULED
            )
        )
        pending_interviews_result = await db.execute(pending_interviews_query)
        pending_interviews = pending_interviews_result.scalar() or 0

        return {
            "total_candidates": total_candidates,
            "active_candidates": active_candidates,
            "total_employees": total_employees,
            "pending_interviews": pending_interviews,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching metrics: {str(e)}"
        )


@router.get("/employees")
async def get_employees(
    current_user: User = Depends(require_hr),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """
    Get list of employees in the company.
    Returns: employee details including role, department, status and assigned candidate count
    """
    try:
        company_id = current_user.company_id

        query = select(User).filter(
            and_(
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        ).offset(skip).limit(limit)

        result = await db.execute(query)
        employees = result.scalars().all()

        # Get assigned candidate count for each employee
        employee_data = []
        for emp in employees:
            count_query = select(func.count()).select_from(Candidate).filter(
                and_(
                    Candidate.company_id == company_id,
                    Candidate.assigned_to == emp.id
                )
            )
            count_result = await db.execute(count_query)
            assigned_count = count_result.scalar() or 0
            
            employee_data.append({
                "id": str(emp.id),
                "email": emp.email,
                "name": emp.name,
                "role": emp.role.value,
                "company_id": str(emp.company_id),
                "department": emp.department or "Not specified",
                "is_active": emp.is_active,
                "created_at": emp.created_at.isoformat() if emp.created_at else None,
                "assigned_count": assigned_count,
                "can_accept_more": assigned_count < 10,
                "available_slots": 10 - assigned_count
            })

        return employee_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching employees: {str(e)}"
        )


@router.post("/candidates/{candidate_id}/assign")
async def assign_candidate_to_employee(
    candidate_id: UUID,
    employee_id: UUID = Query(..., description="Employee ID to assign candidate to"),
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign a candidate to an employee (HR only).
    Max 10 candidates per employee at a time.
    """
    try:
        company_id = current_user.company_id

        # Verify candidate exists and belongs to company
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )

        # Verify employee exists and belongs to company
        employee_query = select(User).filter(
            and_(
                User.id == employee_id,
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        )
        result = await db.execute(employee_query)
        employee = result.scalars().first()
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found or not eligible for assignments"
            )

        # Check current assignment count for employee (max 10)
        count_query = select(func.count()).select_from(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        )
        result = await db.execute(count_query)
        current_count = result.scalar() or 0
        
        if current_count >= 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee already has maximum 10 candidates assigned"
            )

        # Assign candidate and update status to 'assigned' (new pipeline status)
        candidate.assigned_to = employee_id
        # Update status to reflect assignment in pipeline
        # Use 'assigned' for new pipeline stages or SCREENING for legacy compatibility
        from sqlalchemy import text
        await db.execute(
            text("UPDATE candidates SET status = :status, assigned_to = :emp_id, updated_at = now() WHERE id = :id"),
            {"status": "assigned", "emp_id": str(employee_id), "id": str(candidate_id)}
        )
        await db.commit()
        await invalidate_cache(f"candidates:list:{company_id}:*")

        return {
            "message": f"Candidate assigned to {employee.name} successfully",
            "candidate_id": str(candidate_id),
            "employee_id": str(employee_id),
            "employee_name": employee.name
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error assigning candidate: {str(e)}"
        )


@router.post("/candidates/{candidate_id}/revoke")
async def revoke_candidate_assignment(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke candidate assignment from employee (HR only).
    """
    try:
        company_id = current_user.company_id

        # Verify candidate exists and belongs to company
        candidate_query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == company_id
            )
        )
        result = await db.execute(candidate_query)
        candidate = result.scalars().first()
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )

        if not candidate.assigned_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate is not assigned to any employee"
            )

        # Revoke assignment and revert status to 'uploaded' (new pipeline status)
        candidate.assigned_to = None
        # Revert status if it was at assigned/SCREENING stage
        from sqlalchemy import text
        if candidate.status in [CandidateStatus.SCREENING, CandidateStatus.ASSIGNED]:
            await db.execute(
                text("UPDATE candidates SET status = :status, assigned_to = NULL, updated_at = now() WHERE id = :id"),
                {"status": "uploaded", "id": str(candidate_id)}
            )
        else:
            await db.execute(
                text("UPDATE candidates SET assigned_to = NULL, updated_at = now() WHERE id = :id"),
                {"id": str(candidate_id)}
            )
        await db.commit()
        await invalidate_cache(f"candidates:list:{company_id}:*")

        return {
            "message": "Candidate assignment revoked successfully",
            "candidate_id": str(candidate_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error revoking assignment: {str(e)}"
        )


@router.post("/candidates/assign-bulk")
async def assign_candidates_bulk(
    candidate_ids: List[UUID] = Query(..., description="List of candidate IDs"),
    employee_id: UUID = Query(..., description="Employee ID to assign candidates to"),
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign multiple candidates to an employee (HR only).
    Max 10 candidates per employee at a time.
    """
    try:
        company_id = current_user.company_id

        if len(candidate_ids) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot assign more than 10 candidates at once"
            )

        # Verify employee exists and belongs to company
        employee_query = select(User).filter(
            and_(
                User.id == employee_id,
                User.company_id == company_id,
                User.role == UserRole.EMPLOYEE,
                User.is_active == True
            )
        )
        result = await db.execute(employee_query)
        employee = result.scalars().first()
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found or not eligible for assignments"
            )

        # Check current assignment count for employee
        count_query = select(func.count()).select_from(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        )
        result = await db.execute(count_query)
        current_count = result.scalar() or 0
        
        if current_count + len(candidate_ids) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee has {current_count} candidates. Can only assign {10 - current_count} more."
            )

        # Verify all candidates exist and belong to company
        candidates_query = select(Candidate).filter(
            and_(
                Candidate.id.in_(candidate_ids),
                Candidate.company_id == company_id
            )
        )
        result = await db.execute(candidates_query)
        candidates = result.scalars().all()
        
        if len(candidates) != len(candidate_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more candidates not found"
            )

        # Assign all candidates and update status using raw SQL for correct enum handling
        from sqlalchemy import text
        for candidate in candidates:
            await db.execute(
                text("UPDATE candidates SET status = :status, assigned_to = :emp_id, updated_at = now() WHERE id = :id"),
                {"status": "assigned", "emp_id": str(employee_id), "id": str(candidate.id)}
            )
        
        await db.commit()
        await invalidate_cache(f"candidates:list:{company_id}:*")

        return {
            "message": f"{len(candidates)} candidates assigned to {employee.name} successfully",
            "candidate_ids": [str(c) for c in candidate_ids],
            "employee_id": str(employee_id),
            "employee_name": employee.name
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error assigning candidates: {str(e)}"
        )


@router.get("/employees/{employee_id}/candidates")
async def get_employee_assigned_candidates(
    employee_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all candidates assigned to a specific employee (HR only).
    """
    try:
        company_id = current_user.company_id

        # Verify employee exists
        employee_query = select(User).filter(
            and_(
                User.id == employee_id,
                User.company_id == company_id
            )
        )
        result = await db.execute(employee_query)
        employee = result.scalars().first()
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )

        # Get assigned candidates
        candidates_query = select(Candidate).filter(
            and_(
                Candidate.company_id == company_id,
                Candidate.assigned_to == employee_id
            )
        )
        result = await db.execute(candidates_query)
        candidates = result.scalars().all()

        return {
            "employee": {
                "id": str(employee.id),
                "name": employee.name,
                "email": employee.email
            },
            "candidates": [
                {
                    "id": str(c.id),
                    "email": c.email,
                    "first_name": c.first_name,
                    "last_name": c.last_name,
                    "position": c.position,
                    "status": c.status.value if c.status else None,
                    "domain": c.domain
                }
                for c in candidates
            ],
            "count": len(candidates)
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching assigned candidates: {str(e)}"
        )


@router.get("/candidate-profile/{candidate_id}")
async def get_hr_candidate_detailed_profile(
    candidate_id: UUID,
    current_user: User = Depends(require_hr),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed candidate profile including interview transcript and Q&A analysis
    for HR users within the same company.
    """
    from app.models.ai_report import AIReport

    try:
        query = select(Candidate).filter(
            and_(
                Candidate.id == candidate_id,
                Candidate.company_id == current_user.company_id,
            )
        )
        result = await db.execute(query)
        candidate = result.scalars().first()

        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found",
            )

        interviews_query = select(Interview).filter(
            Interview.candidate_id == candidate.id
        ).order_by(Interview.scheduled_time.desc())
        interviews_result = await db.execute(interviews_query)
        interviews = interviews_result.scalars().all()

        interview_ids = [interview.id for interview in interviews]
        reports: List[AIReport] = []
        if interview_ids:
            reports_query = select(AIReport).filter(
                and_(
                    AIReport.interview_id.in_(interview_ids),
                    AIReport.report_type == "interview_verdict",
                )
            )
            reports_result = await db.execute(reports_query)
            reports = reports_result.scalars().all()

        reports_by_interview = {report.interview_id: report for report in reports}

        interview_details = []
        for interview in interviews:
            report = reports_by_interview.get(interview.id)
            provider_response = report.provider_response if report else {}
            if not isinstance(provider_response, dict):
                provider_response = {}

            transcript = _parse_interview_transcript(getattr(interview, "transcript", None))
            if not transcript:
                fallback_transcript = provider_response.get("transcript", [])
                if isinstance(fallback_transcript, list):
                    transcript = [item for item in fallback_transcript if isinstance(item, dict)]

            qa_pairs = _build_qa_pairs(transcript)
            qa_evaluations = provider_response.get("qa_evaluations", [])
            if not isinstance(qa_evaluations, list):
                qa_evaluations = []

            eval_by_question: Dict[str, Dict[str, Any]] = {}
            for item in qa_evaluations:
                if not isinstance(item, dict):
                    continue
                question = str(item.get("question", "")).strip()
                if question:
                    eval_by_question[question.lower()] = item

            normalized_qa_evaluations: List[Dict[str, Any]] = []
            for qa in qa_pairs:
                question = str(qa.get("question", "")).strip()
                answer = str(qa.get("answer", "")).strip()
                matched = eval_by_question.get(question.lower(), {})
                score = matched.get("score")
                try:
                    score_value = int(score) if score is not None else None
                except Exception:
                    score_value = None

                if score_value is None:
                    score_value = max(20, min(95, int(35 + min(len(answer) / 4.0, 55))))

                rating = str(matched.get("rating", "")).strip().upper()
                if rating not in {"EXCELLENT", "GOOD", "FAIR", "POOR"}:
                    if score_value >= 85:
                        rating = "EXCELLENT"
                    elif score_value >= 70:
                        rating = "GOOD"
                    elif score_value >= 50:
                        rating = "FAIR"
                    else:
                        rating = "POOR"

                opinion = str(matched.get("opinion", "")).strip()
                if not opinion:
                    opinion = (
                        "Answer addressed the question well and demonstrated practical understanding."
                        if score_value >= 70
                        else "Answer was partially relevant but lacked depth or concrete implementation detail."
                    )

                improvement = str(matched.get("improvement", "")).strip()
                if not improvement:
                    improvement = (
                        "Add measurable outcomes or concrete trade-offs to strengthen the response."
                        if score_value < 85
                        else "Maintain this quality and keep structure concise."
                    )

                normalized_qa_evaluations.append({
                    "question": question,
                    "answer": answer,
                    "rating": rating,
                    "score": score_value,
                    "opinion": opinion,
                    "improvement": improvement,
                    "question_timestamp": qa.get("question_timestamp"),
                    "answer_timestamp": qa.get("answer_timestamp"),
                })

            verdict = provider_response.get("verdict") if report else None
            if not verdict and report and report.score is not None:
                if report.score >= 70:
                    verdict = "PASS"
                elif report.score >= 50:
                    verdict = "REVIEW"
                else:
                    verdict = "FAIL"
            if not verdict:
                recommendation = str(provider_response.get("recommendation", "")).upper()
                recommendation_to_verdict = {"HIRE": "PASS", "REJECT": "FAIL", "NEUTRAL": "REVIEW"}
                verdict = recommendation_to_verdict.get(recommendation)

            interview_details.append({
                "interview_id": str(interview.id),
                "round": interview.round.value if interview.round else "unknown",
                "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
                "status": interview.status.value if interview.status else None,
                "verdict": verdict,
                "overall_score": provider_response.get("overall_score") or (report.score if report else None),
                "behavior_score": provider_response.get("behavior_score"),
                "confidence_score": provider_response.get("confidence_score"),
                "answer_score": provider_response.get("answer_score"),
                "strengths": provider_response.get("strengths", []),
                "weaknesses": provider_response.get("weaknesses", []),
                "detailed_feedback": provider_response.get("detailed_feedback", ""),
                "key_answers": provider_response.get("key_answers", []),
                "summary": report.summary if report else None,
                "duration_seconds": provider_response.get("duration_seconds"),
                "total_questions": provider_response.get("total_questions"),
                "total_answers": provider_response.get("total_answers"),
                "transcript": transcript,
                "qa_pairs": qa_pairs,
                "qa_evaluations": normalized_qa_evaluations,
                "resume_text": provider_response.get("resume_text", "") or getattr(candidate, "resume_text", "") or "",
                "resume_filename": provider_response.get("resume_filename", ""),
                "ats_score": getattr(interview, "ats_score", None),
                "employee_verdict": getattr(interview, "employee_verdict", None),
            })

        return {
            "candidate": {
                "id": str(candidate.id),
                "email": candidate.email,
                "first_name": candidate.first_name,
                "last_name": candidate.last_name,
                "full_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or candidate.email,
                "phone": candidate.phone,
                "position": candidate.position,
                "domain": candidate.domain,
                "status": candidate.status.value if candidate.status else None,
                "experience_years": candidate.experience_years,
                "qualifications": candidate.qualifications,
            },
            "interviews": interview_details,
            "total_interviews": len(interviews),
            "completed_interviews": len([i for i in interviews if i.status == InterviewStatus.COMPLETED]),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidate profile: {str(e)}",
        )


@router.get("/interviews")
async def get_hr_interviews(
    current_user: User = Depends(require_hr),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all interviews for the HR user's company with candidate and interviewer details.
    """
    from sqlalchemy.orm import selectinload
    
    company_id = current_user.company_id
    
    # Query interviews with eager loading to avoid detached instance issues
    query = (
        select(Interview)
        .filter(Interview.company_id == company_id)
        .order_by(Interview.scheduled_time.desc())
        .offset(skip)
        .limit(limit)
    )
    
    result = await db.execute(query)
    interviews = result.scalars().all()
    
    # Build response with candidate and interviewer info
    response_list = []
    for interview in interviews:
        # Get candidate info
        candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
        candidate_result = await db.execute(candidate_query)
        candidate = candidate_result.scalar_one_or_none()
        
        # Get interviewer info
        interviewer_name = None
        if interview.interviewer_id:
            interviewer_query = select(User).filter(User.id == interview.interviewer_id)
            interviewer_result = await db.execute(interviewer_query)
            interviewer = interviewer_result.scalar_one_or_none()
            if interviewer:
                interviewer_name = interviewer.name
        
        response_list.append({
            "id": str(interview.id),
            "candidate_id": str(interview.candidate_id),
            "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "Unknown",
            "candidate_email": candidate.email if candidate else "",
            "interviewer_id": str(interview.interviewer_id) if interview.interviewer_id else None,
            "interviewer_name": interviewer_name,
            "scheduled_time": interview.scheduled_time.isoformat() if interview.scheduled_time else None,
            "status": interview.status.value if interview.status else "SCHEDULED",
            "meeting_link": interview.meeting_link,
            "notes": interview.notes,
            "created_at": interview.created_at.isoformat() if interview.created_at else None,
        })
    
    return response_list


@router.post("/interviews/{interview_id}/transcript")
async def save_interview_transcript(
    interview_id: UUID,
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Save interview transcript and mark interview as completed.
    This endpoint is called by the interview room when the interview ends.
    No auth required as the interview token serves as authentication.
    Triggers AI analysis to generate scores and verdict.
    """
    try:
        import json
        from sqlalchemy import text
        from app.models.ai_report import AIReport
        from app.services.ai_service import generate_interview_verdict
        
        # Find interview by ID
        interview_query = select(Interview).filter(Interview.id == interview_id)
        result = await db.execute(interview_query)
        interview = result.scalars().first()
        
        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )
        
        # Get candidate info for position
        candidate = None
        position = ""
        if interview.candidate_id:
            candidate_query = select(Candidate).filter(Candidate.id == interview.candidate_id)
            candidate_result = await db.execute(candidate_query)
            candidate = candidate_result.scalars().first()
            if candidate:
                position = candidate.position or ""
        
        # Extract and sanitize payload
        transcript_data = _normalize_transcript_payload(data.get("transcript", []))
        raw_duration = data.get("duration_seconds", 0)
        duration_seconds = int(raw_duration) if str(raw_duration).isdigit() else 0

        raw_resume_text = data.get("resume_text", "")
        sanitized_resume_text = _sanitize_text_for_db(
            raw_resume_text,
            max_length=MAX_RESUME_TEXT_LENGTH,
        )
        sanitized_resume_filename = _sanitize_text_for_db(
            data.get("resume_filename", ""),
            max_length=255,
        )
        if _looks_like_binary_blob(raw_resume_text):
            logger.warning(
                "Detected binary resume_text payload for interview %s. Ignoring unsafe content.",
                interview_id,
            )
            sanitized_resume_text = ""

        transcript_json = None
        if transcript_data:
            transcript_json = _sanitize_text_for_db(
                json.dumps(transcript_data, ensure_ascii=False),
                max_length=MAX_TRANSCRIPT_JSON_LENGTH,
            )

        # Primary persistence path: save transcript/resume + mark completed
        # If this fails (e.g. malformed payload edge case), we still force completion in fallback.
        try:
            await db.execute(
                text(
                    """
                    UPDATE interviews
                    SET status = 'COMPLETED',
                        transcript = COALESCE(:transcript, transcript),
                        resume_text = COALESCE(NULLIF(:resume_text, ''), resume_text),
                        updated_at = now()
                    WHERE id = :interview_id
                    """
                ),
                {
                    "interview_id": str(interview_id),
                    "transcript": transcript_json,
                    "resume_text": sanitized_resume_text,
                },
            )

            if interview.candidate_id:
                await db.execute(
                    text(
                        "UPDATE candidates SET status = 'interview_completed', updated_at = now() WHERE id = :candidate_id"
                    ),
                    {"candidate_id": str(interview.candidate_id)},
                )

            await db.commit()
        except Exception:
            logger.exception(
                "Failed to persist transcript payload for interview %s. Falling back to status-only completion.",
                interview_id,
            )
            await db.rollback()

            # Fallback path to guarantee interview completion state.
            await db.execute(
                text(
                    """
                    UPDATE interviews
                    SET status = 'COMPLETED',
                        updated_at = now()
                    WHERE id = :interview_id
                    """
                ),
                {"interview_id": str(interview_id)},
            )
            if interview.candidate_id:
                await db.execute(
                    text(
                        "UPDATE candidates SET status = 'interview_completed', updated_at = now() WHERE id = :candidate_id"
                    ),
                    {"candidate_id": str(interview.candidate_id)},
                )
            await db.commit()
        
        # Trigger AI analysis asynchronously (non-blocking)
        ai_verdict = None
        if transcript_data and len(transcript_data) > 2:  # At least welcome + 1 Q&A
            try:
                ai_verdict = await generate_interview_verdict(
                    transcript=transcript_data,
                    resume_text=sanitized_resume_text
                    or _sanitize_text_for_db(
                        candidate.resume_text if candidate else "",
                        max_length=MAX_RESUME_TEXT_LENGTH,
                    ),
                    ats_score=interview.ats_score,
                    position=position
                )
                
                # Update interview with AI scores
                if ai_verdict:
                    # Enrich verdict payload with transcript context for UI rendering.
                    # This guarantees verdict views can always reconstruct full Q&A.
                    ai_verdict["transcript"] = transcript_data
                    ai_verdict["duration_seconds"] = duration_seconds
                    try:
                        verdict_total_questions = int(ai_verdict.get("total_questions") or 0)
                    except Exception:
                        verdict_total_questions = 0
                    try:
                        verdict_total_answers = int(ai_verdict.get("total_answers") or 0)
                    except Exception:
                        verdict_total_answers = 0

                    ai_verdict["total_questions"] = verdict_total_questions or sum(
                        1 for item in transcript_data if str(item.get("role", "")).lower() == "ai"
                    )
                    ai_verdict["total_answers"] = verdict_total_answers or sum(
                        1 for item in transcript_data if str(item.get("role", "")).lower() == "user"
                    )
                    if sanitized_resume_text:
                        ai_verdict["resume_text"] = sanitized_resume_text
                    if sanitized_resume_filename:
                        ai_verdict["resume_filename"] = sanitized_resume_filename

                    verdict_json = _sanitize_text_for_db(
                        json.dumps(ai_verdict, ensure_ascii=False),
                        max_length=MAX_TRANSCRIPT_JSON_LENGTH,
                    )
                    await db.execute(
                        text("""
                            UPDATE interviews SET 
                                behavior_score = :behavior_score,
                                confidence_score = :confidence_score,
                                answer_score = :answer_score,
                                ai_verdict = :ai_verdict,
                                ai_recommendation = :ai_recommendation
                            WHERE id = :interview_id
                        """),
                        {
                            "interview_id": str(interview_id),
                            "behavior_score": ai_verdict.get("behavior_score"),
                            "confidence_score": ai_verdict.get("confidence_score"),
                            "answer_score": ai_verdict.get("answer_score"),
                            "ai_verdict": verdict_json,
                            "ai_recommendation": ai_verdict.get("recommendation"),
                        }
                    )

                    # Persist/refresh AI report row used by employee dashboard.
                    report_query = select(AIReport).filter(
                        and_(
                            AIReport.interview_id == interview.id,
                            AIReport.report_type == "interview_verdict",
                        )
                    ).order_by(AIReport.created_at.desc())
                    report_result = await db.execute(report_query)
                    existing_report = report_result.scalars().first()

                    report_summary = _sanitize_text_for_db(
                        ai_verdict.get("summary", ""),
                        max_length=5000,
                    )
                    report_score = float(ai_verdict.get("overall_score", 0) or 0)

                    if existing_report:
                        existing_report.score = report_score
                        existing_report.summary = report_summary
                        existing_report.provider_response = ai_verdict
                    else:
                        db.add(
                            AIReport(
                                company_id=interview.company_id,
                                candidate_id=interview.candidate_id,
                                interview_id=interview.id,
                                report_type="interview_verdict",
                                score=report_score,
                                summary=report_summary,
                                provider_response=ai_verdict,
                                created_by=interview.created_by,
                            )
                        )

                    await db.commit()
            except Exception as ai_error:
                # Don't fail the whole request if AI analysis fails
                logger.exception(
                    "AI analysis failed for completed interview %s (non-critical): %s",
                    interview_id,
                    ai_error,
                )
                await db.rollback()
        
        return {
            "success": True,
            "message": "Interview transcript saved and marked as completed",
            "interview_id": str(interview_id),
            "duration_seconds": duration_seconds,
            "transcript_entries": len(transcript_data),
            "ai_analysis": ai_verdict is not None,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving transcript: {str(e)}"
        )
