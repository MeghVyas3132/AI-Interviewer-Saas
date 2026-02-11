"""
Sync candidate status based on interview completion state.

This script fixes candidates whose status wasn't properly updated after AI interview.
It checks all completed interviews and updates candidate status accordingly:
- HIRE recommendation -> ai_passed
- REJECT recommendation -> ai_rejected  
- NEUTRAL recommendation -> ai_review
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = 'postgresql+asyncpg://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db'

async def sync_candidate_status():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Find candidates with completed interviews but wrong status
        result = await session.execute(text('''
            SELECT 
                c.id as candidate_id,
                c.email as candidate_email,
                c.status as current_status,
                i.id as interview_id,
                i.status as interview_status,
                i.ai_recommendation,
                i.ai_verdict
            FROM candidates c
            JOIN interviews i ON c.id = i.candidate_id
            WHERE i.status = 'COMPLETED'
            AND c.status NOT IN ('ai_passed', 'ai_rejected', 'ai_review', 'hired', 'REJECTED', 'final_review')
            ORDER BY i.created_at DESC
        '''))
        rows = result.fetchall()
        
        if not rows:
            print("All candidates are properly synced!")
            return
        
        print(f"Found {len(rows)} candidates needing status update:\n")
        
        for row in rows:
            candidate_id = row[0]
            email = row[1]
            current_status = row[2]
            ai_recommendation = row[5]
            
            # Determine correct status
            if ai_recommendation == 'HIRE':
                new_status = 'ai_passed'
            elif ai_recommendation == 'REJECT':
                new_status = 'ai_rejected'
            else:
                new_status = 'ai_review'
            
            print(f"  {email}: {current_status} -> {new_status} (AI rec: {ai_recommendation})")
            
            # Update candidate status
            await session.execute(
                text("UPDATE candidates SET status = :status, updated_at = NOW() WHERE id = :id"),
                {"status": new_status, "id": str(candidate_id)}
            )
        
        await session.commit()
        print(f"\n✓ Updated {len(rows)} candidates")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(sync_candidate_status())
