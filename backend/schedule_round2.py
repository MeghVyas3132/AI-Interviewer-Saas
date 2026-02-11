"""Check vivek's current state and schedule Round 2 interview."""
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql://postgres:root@localhost:5432/ai_interviewer_db")
Session = sessionmaker(bind=engine)
session = Session()

def check_and_schedule():
    # Get vivek's candidate info
    candidate = session.execute(text("""
        SELECT c.id, c.email, c.status, c.company_id, c.assigned_to,
               u.email as employee_email
        FROM candidates c
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.email = 'vivek@gmail.com'
    """)).fetchone()
    
    if not candidate:
        print("Candidate vivek@gmail.com not found")
        return
    
    print(f"Candidate: {candidate.email}")
    print(f"  Status: {candidate.status}")
    print(f"  Assigned to: {candidate.employee_email}")
    print(f"  Company ID: {candidate.company_id}")
    
    # Check existing interviews
    interviews = session.execute(text("""
        SELECT id, status, ai_recommendation, scheduled_time
        FROM interviews
        WHERE candidate_id = :candidate_id
        ORDER BY scheduled_time DESC
    """), {"candidate_id": str(candidate.id)}).fetchall()
    
    print(f"\nExisting interviews: {len(interviews)}")
    for i in interviews:
        print(f"  {i.id}: status={i.status}, ai_rec={i.ai_recommendation}")
    
    # Check interview rounds
    rounds = session.execute(text("""
        SELECT ir.id, ir.round_number, ir.status, ir.interview_mode, ir.videosdk_meeting_id
        FROM interview_rounds ir
        JOIN interviews i ON ir.interview_id = i.id
        WHERE i.candidate_id = :candidate_id
        ORDER BY ir.round_number
    """), {"candidate_id": str(candidate.id)}).fetchall()
    
    print(f"\nInterview rounds: {len(rounds)}")
    for r in rounds:
        print(f"  Round {r.round_number}: {r.id}, status={r.status}, mode={r.interview_mode}")
    
    # If candidate is in ai_review, we need to first approve them for Round 2
    # Then schedule a human-assisted interview round
    
    if candidate.status == 'ai_review':
        print("\n--- Approving candidate for Round 2 ---")
        
        # Update candidate status to eligible_round_2
        session.execute(text("""
            UPDATE candidates 
            SET status = 'eligible_round_2'
            WHERE id = :candidate_id
        """), {"candidate_id": str(candidate.id)})
        
        print("  Candidate status updated to eligible_round_2")
    
    # Check if there's a round 2 interview round scheduled
    human_round = session.execute(text("""
        SELECT ir.id FROM interview_rounds ir
        JOIN interviews i ON ir.interview_id = i.id
        WHERE i.candidate_id = :candidate_id
        AND ir.round_number = 2
    """), {"candidate_id": str(candidate.id)}).fetchone()
    
    # Get the existing interview for this candidate
    existing_interview = interviews[0] if interviews else None
    
    if not human_round and existing_interview:
        print("\n--- Creating Human-AI Assisted Interview Round 2 ---")
        
        import uuid
        
        # Create interview round 2 for the existing interview
        round_id = str(uuid.uuid4())
        scheduled_time = datetime.now() + timedelta(hours=1)  # Schedule 1 hour from now
        
        session.execute(text("""
            INSERT INTO interview_rounds (id, interview_id, round_number, status, interview_mode, scheduled_at, created_at, updated_at)
            VALUES (:id, :interview_id, 2, 'SCHEDULED', 'HUMAN_AI_ASSISTED', :scheduled_at, NOW(), NOW())
        """), {
            "id": round_id,
            "interview_id": str(existing_interview.id),
            "scheduled_at": scheduled_time
        })
        
        print(f"  Created round 2: {round_id}")
        print(f"  Scheduled for: {scheduled_time}")
        
        # Update candidate status
        session.execute(text("""
            UPDATE candidates 
            SET status = 'eligible_round_2'
            WHERE id = :candidate_id
        """), {"candidate_id": str(candidate.id)})
        
        print("  Candidate status updated to eligible_round_2")
    elif human_round:
        print(f"\nRound 2 already exists: {human_round.id}")
    else:
        print("\nNo existing interview found to attach Round 2 to")
    
    session.commit()
    print("\n✅ Done! Vivek should now see the Round 2 interview in their portal.")

if __name__ == "__main__":
    check_and_schedule()
    session.close()
