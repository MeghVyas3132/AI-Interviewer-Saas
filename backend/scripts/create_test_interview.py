"""
Create a test interview for local testing of the complete interview flow.
Run: python scripts/create_test_interview.py
"""
import asyncio
import secrets
from datetime import datetime, timedelta
from uuid import UUID

# Add parent directory to path
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

async def create_test_interview():
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    
    DATABASE_URL = "postgresql+asyncpg://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db"
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Get a candidate
        result = await session.execute(
            text("SELECT id, first_name, last_name, email, company_id, job_template_id FROM candidates LIMIT 1")
        )
        candidate = result.fetchone()
        
        if not candidate:
            print("No candidates found. Please seed the database first.")
            return
        
        candidate_id = candidate[0]
        candidate_name = f"{candidate[1]} {candidate[2]}"
        candidate_email = candidate[3]
        company_id = candidate[4]
        job_template_id = candidate[5]
        
        # Get an employee (interviewer)
        result = await session.execute(
            text("SELECT id, name FROM users WHERE role = 'EMPLOYEE' LIMIT 1")
        )
        employee = result.fetchone()
        
        if not employee:
            print("No employees found. Please seed the database first.")
            return
        
        interviewer_id = employee[0]
        interviewer_name = employee[1]
        
        # Generate interview token
        interview_token = secrets.token_urlsafe(32)
        
        # Schedule for now (interview window is -15min to +30min)
        scheduled_time = datetime.utcnow() + timedelta(minutes=5)
        
        # Create interview
        await session.execute(
            text("""
                INSERT INTO interviews (
                    id, company_id, candidate_id, interviewer_id, 
                    round, scheduled_time, status, ai_interview_token,
                    timezone, created_at
                ) VALUES (
                    gen_random_uuid(), :company_id, :candidate_id, :interviewer_id,
                    'TECHNICAL', :scheduled_time, 'SCHEDULED', :token,
                    'UTC', NOW()
                )
            """),
            {
                "company_id": str(company_id),
                "candidate_id": str(candidate_id),
                "interviewer_id": str(interviewer_id),
                "scheduled_time": scheduled_time,
                "token": interview_token
            }
        )
        
        # Update candidate status to interview_scheduled
        await session.execute(
            text("UPDATE candidates SET status = 'interview_scheduled' WHERE id = :id"),
            {"id": str(candidate_id)}
        )
        
        await session.commit()
        
        print("=" * 60)
        print("TEST INTERVIEW CREATED SUCCESSFULLY")
        print("=" * 60)
        print(f"Candidate: {candidate_name} ({candidate_email})")
        print(f"Interviewer: {interviewer_name}")
        print(f"Scheduled: {scheduled_time.isoformat()}")
        print()
        print("INTERVIEW URL:")
        print(f"  http://localhost:3000/interview/{interview_token}")
        print()
        print("INSTRUCTIONS:")
        print("1. Open the interview URL in your browser")
        print("2. Upload a resume (or skip if allowed)")
        print("3. Complete device check")
        print("4. Start the interview")
        print("5. Answer the AI questions using your microphone")
        print("6. Complete all questions to finish")
        print()
        print("After completion, check employee dashboard:")
        print("  Login as: mahibundela@gmail.com / AdminPass123!")
        print("  The candidate should appear in Round 2+ or Pending Review tab")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(create_test_interview())
