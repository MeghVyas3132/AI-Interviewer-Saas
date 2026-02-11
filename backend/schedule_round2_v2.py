"""Schedule Round 2 interview for vivek - Fixed for correct schema."""
import os
import sys
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql://postgres:root@localhost:5432/ai_interviewer_db")
Session = sessionmaker(bind=engine)
session = Session()

def schedule_round2():
    # Get vivek's candidate info
    candidate = session.execute(text("""
        SELECT c.id, c.email, c.status, c.company_id, c.assigned_to
        FROM candidates c
        WHERE c.email = 'vivek@gmail.com'
    """)).fetchone()
    
    if not candidate:
        print("Candidate vivek@gmail.com not found")
        return
    
    print(f"Candidate: {candidate.email}")
    print(f"  ID: {candidate.id}")
    print(f"  Status: {candidate.status}")
    print(f"  Company ID: {candidate.company_id}")
    
    # Get employee (soe shah) info
    employee = session.execute(text("""
        SELECT id, name, email FROM users WHERE id = :id
    """), {"id": str(candidate.assigned_to)}).fetchone()
    
    if employee:
        print(f"  Assigned to: {employee.name} ({employee.email})")
    
    # Check existing interview_rounds for this candidate
    rounds = session.execute(text("""
        SELECT id, round_type, status, interview_mode, scheduled_at, videosdk_meeting_id
        FROM interview_rounds
        WHERE candidate_id = :candidate_id
        ORDER BY scheduled_at DESC
    """), {"candidate_id": str(candidate.id)}).fetchall()
    
    print(f"\nExisting interview rounds: {len(rounds)}")
    for r in rounds:
        print(f"  {r.id}: type={r.round_type}, status={r.status}, mode={r.interview_mode}")
    
    # Check if there's already a HUMAN_AI_ASSISTED round
    human_round = None
    for r in rounds:
        if r.interview_mode == 'HUMAN_AI_ASSISTED':
            human_round = r
            break
    
    if not human_round:
        print("\n--- Creating Human-AI Assisted Interview Round ---")
        
        round_id = str(uuid.uuid4())
        scheduled_time = datetime.now() + timedelta(minutes=5)  # 5 minutes from now
        
        # Create the interview round
        session.execute(text("""
            INSERT INTO interview_rounds (
                id, company_id, candidate_id, round_type, interviewer_id, 
                scheduled_at, timezone, duration_minutes, status, 
                interview_mode, created_by, created_at, updated_at
            )
            VALUES (
                :id, :company_id, :candidate_id, 'TECHNICAL', :interviewer_id,
                :scheduled_at, 'UTC', 60, 'SCHEDULED',
                'HUMAN_AI_ASSISTED', :interviewer_id, NOW(), NOW()
            )
        """), {
            "id": round_id,
            "company_id": str(candidate.company_id),
            "candidate_id": str(candidate.id),
            "interviewer_id": str(candidate.assigned_to),
            "scheduled_at": scheduled_time
        })
        
        print(f"  Created round: {round_id}")
        print(f"  Scheduled for: {scheduled_time}")
        print(f"  Mode: HUMAN_AI_ASSISTED")
        
        # Update candidate status
        session.execute(text("""
            UPDATE candidates 
            SET status = 'eligible_round_2'
            WHERE id = :candidate_id
        """), {"candidate_id": str(candidate.id)})
        
        print("  Candidate status updated to eligible_round_2")
        
        session.commit()
        print("\n✅ Done! Vivek should now see the Round 2 interview scheduled.")
    else:
        print(f"\nHuman-AI round already exists: {human_round.id}")
        print(f"  Scheduled at: {human_round.scheduled_at}")

if __name__ == "__main__":
    schedule_round2()
    session.close()
