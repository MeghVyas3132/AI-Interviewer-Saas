"""Debug employee dashboard data for soe shah."""
import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as s:
        # Find soe shah user
        r = await s.execute(text("SELECT id, email, name, company_id FROM users WHERE name LIKE '%soe%' OR email LIKE '%soe%'"))
        user = r.fetchone()
        if not user:
            print("User 'soe shah' not found")
            return
        
        user_id, email, name, company_id = user
        print(f"User: {name} ({email}), company_id={company_id}")
        
        # Check assigned candidates
        r = await s.execute(text("""
            SELECT id, email, first_name, last_name, status, assigned_to 
            FROM candidates 
            WHERE company_id = :company_id AND assigned_to = :user_id
        """), {"company_id": str(company_id), "user_id": str(user_id)})
        candidates = r.fetchall()
        print(f"\nAssigned candidates: {len(candidates)}")
        for c in candidates:
            print(f"  {c[0]}: {c[1]} ({c[2]} {c[3]}) - status={c[4]}")
        
        # Check all candidates in company with their statuses
        r = await s.execute(text("""
            SELECT id, email, status, assigned_to 
            FROM candidates 
            WHERE company_id = :company_id
        """), {"company_id": str(company_id)})
        all_candidates = r.fetchall()
        print(f"\nAll company candidates: {len(all_candidates)}")
        for c in all_candidates:
            print(f"  {c[0]}: {c[1]} - status={c[2]}, assigned_to={c[3]}")
        
        # Check interviews
        r = await s.execute(text("""
            SELECT i.id, i.candidate_id, i.status, i.ai_recommendation, c.email
            FROM interviews i
            JOIN candidates c ON i.candidate_id = c.id
            WHERE i.company_id = :company_id
        """), {"company_id": str(company_id)})
        interviews = r.fetchall()
        print(f"\nInterviews: {len(interviews)}")
        for i in interviews:
            print(f"  {i[0]}: candidate={i[4]}, status={i[2]}, ai_rec={i[3]}")
        
        # Check interview_rounds
        r = await s.execute(text("""
            SELECT ir.id, ir.candidate_id, ir.status, ir.round_type, ir.interviewer_id, c.email
            FROM interview_rounds ir
            JOIN candidates c ON ir.candidate_id = c.id
            WHERE ir.company_id = :company_id
        """), {"company_id": str(company_id)})
        rounds = r.fetchall()
        print(f"\nInterview rounds: {len(rounds)}")
        for r in rounds:
            print(f"  {r[0]}: candidate={r[5]}, status={r[2]}, type={r[3]}, interviewer={r[4]}")

asyncio.run(main())
