import asyncio
import asyncpg

async def check_candidates():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    # Check candidates
    candidates = await conn.fetch("""
        SELECT c.email, c.status, u.email as assigned_to
        FROM candidates c
        LEFT JOIN users u ON u.id = c.assigned_to
        WHERE c.email IN ('sakshi@gmail.com', 'manvi@gmail.com')
    """)
    
    for c in candidates:
        print(f"{c['email']} | status: {c['status']} | assigned: {c['assigned_to']}")
    
    # Check interviews
    print("\nInterviews:")
    interviews = await conn.fetch("""
        SELECT c.email, i.status, i.ai_recommendation
        FROM interviews i
        JOIN candidates c ON c.id = i.candidate_id
    """)
    for i in interviews:
        print(f"  {i['email']} | interview: {i['status']} | ai_rec: {i['ai_recommendation']}")
    
    await conn.close()

asyncio.run(check_candidates())
