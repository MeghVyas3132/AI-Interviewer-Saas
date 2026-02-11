"""Simulate interview completion to test dashboard tabs."""
import asyncio
import os
import sys
from datetime import datetime

# Set up Django settings
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:root@localhost:5432/ai_interviewer_db")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Create sync engine
engine = create_engine("postgresql://postgres:root@localhost:5432/ai_interviewer_db")
Session = sessionmaker(bind=engine)
session = Session()

def simulate_completion():
    # Get the interview for vivek - use only the columns we know exist
    interview = session.execute(text("""
        SELECT i.id, i.candidate_id, i.status, c.email, c.status as candidate_status
        FROM interviews i
        JOIN candidates c ON i.candidate_id = c.id
        WHERE c.email = 'vivek@gmail.com'
    """)).fetchone()
    
    if not interview:
        print("No interview found for vivek@gmail.com")
        return
    
    print(f"Current state:")
    print(f"  Interview ID: {interview.id}")
    print(f"  Interview Status: {interview.status}")
    print(f"  Candidate Email: {interview.email}")
    print(f"  Candidate Status: {interview.candidate_status}")
    
    # Update interview to COMPLETED with AI recommendation
    session.execute(text("""
        UPDATE interviews 
        SET status = 'COMPLETED',
            ai_recommendation = 'REVIEW',
            answer_score = 65
        WHERE id = :interview_id
    """), {"interview_id": str(interview.id)})
    
    # Update candidate status to AI_REVIEW so they appear in "Needs Review" tab
    session.execute(text("""
        UPDATE candidates 
        SET status = 'ai_review'
        WHERE id = :candidate_id
    """), {"candidate_id": str(interview.candidate_id)})
    
    session.commit()
    
    # Verify the update
    updated = session.execute(text("""
        SELECT i.status as interview_status, i.ai_recommendation, i.answer_score,
               c.status as candidate_status
        FROM interviews i
        JOIN candidates c ON i.candidate_id = c.id
        WHERE c.email = 'vivek@gmail.com'
    """)).fetchone()
    
    print(f"\nUpdated state:")
    print(f"  Interview Status: {updated.interview_status}")
    print(f"  AI Recommendation: {updated.ai_recommendation}")
    print(f"  Answer Score: {updated.answer_score}")
    print(f"  Candidate Status: {updated.candidate_status}")
    print(f"\n✅ vivek@gmail.com should now appear in the 'Needs Review' tab!")
    print(f"   (AI gave REVIEW recommendation, employee needs to decide)")

if __name__ == "__main__":
    simulate_completion()
    session.close()
