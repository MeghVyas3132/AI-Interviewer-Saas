"""Debug script to check DB state"""
import asyncio
import json

async def check():
    from sqlalchemy import text
    from app.core.database import async_session_maker
    async with async_session_maker() as db:
        # Check candidates
        r = await db.execute(text('SELECT id, email, first_name, last_name, status, assigned_to, position, job_template_id FROM candidates ORDER BY created_at'))
        rows = r.fetchall()
        print(f'=== CANDIDATES ({len(rows)}) ===')
        for row in rows:
            print(f'  id={str(row[0])[:8]} email={row[1]} name={row[2]} {row[3]} status={row[4]} assigned_to={str(row[5])[:8] if row[5] else None} position={row[6]}')
        
        print()
        
        # Check interviews
        r2 = await db.execute(text('SELECT id, candidate_id, status, round, ai_interview_token, interviewer_id, behavior_score, confidence_score, answer_score, ai_recommendation FROM interviews ORDER BY created_at'))
        rows2 = r2.fetchall()
        print(f'=== INTERVIEWS ({len(rows2)}) ===')
        for row in rows2:
            token_short = row[4][:12] if row[4] else None
            print(f'  id={str(row[0])[:8]} cand={str(row[1])[:8] if row[1] else None} status={row[2]} round={row[3]} token={token_short}... interviewer={str(row[5])[:8] if row[5] else None} scores=B:{row[6]} C:{row[7]} A:{row[8]} rec={row[9]}')
        
        print()
        
        # Check users
        r3 = await db.execute(text('SELECT id, email, role, company_id FROM users ORDER BY created_at'))
        rows3 = r3.fetchall()
        print(f'=== USERS ({len(rows3)}) ===')
        for row in rows3:
            print(f'  id={str(row[0])[:8]} email={row[1]} role={row[2]} company={str(row[3])[:8] if row[3] else None}')
        
        print()
        
        # Check AI reports
        r4 = await db.execute(text('SELECT id, interview_id, report_type, score, summary FROM ai_reports ORDER BY created_at'))
        rows4 = r4.fetchall()
        print(f'=== AI_REPORTS ({len(rows4)}) ===')
        for row in rows4:
            print(f'  id={str(row[0])[:8]} interview={str(row[1])[:8] if row[1] else None} type={row[2]} score={row[3]} summary={str(row[4])[:80] if row[4] else None}')

asyncio.run(check())
