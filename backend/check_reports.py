import asyncio
import asyncpg

async def check_reports():
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='ai_interviewer_user',
        password='ai_interviewer_password',
        database='ai_interviewer_db'
    )
    
    # Check interviews
    print("=== INTERVIEWS ===")
    interviews = await conn.fetch("""
        SELECT i.id, i.status, c.email 
        FROM interviews i
        JOIN candidates c ON c.id = i.candidate_id
    """)
    for i in interviews:
        print(f"  {i['email']} | {i['status']} | id: {i['id']}")
    
    # Check AI reports
    print("\n=== AI REPORTS ===")
    reports = await conn.fetch("""
        SELECT * FROM ai_reports
    """)
    if reports:
        for r in reports:
            print(f"  Interview: {r['interview_id']} | Score: {r.get('score')}")
    else:
        print("  No AI reports found!")
    
    await conn.close()

asyncio.run(check_reports())
