"""Debug script to check omi/jini state."""
from sqlalchemy import create_engine, text

e = create_engine('postgresql://ai_interviewer_user:ai_interviewer_password@localhost:5432/ai_interviewer_db')
c = e.connect()

print("=== CANDIDATE: omi ===")
r = c.execute(text("SELECT id,email,status,assigned_to,first_name,last_name,position,company_id FROM candidates WHERE email='omi@gmail.com'"))
for row in r:
    d = dict(row._mapping)
    print(d)
    omi_id = d['id']
    omi_assigned = d['assigned_to']

print("\n=== EMPLOYEE: jini ===")
r2 = c.execute(text("SELECT id,email,role,company_id,is_active,email_verified FROM users WHERE email='jini@gmail.com'"))
for row in r2:
    d = dict(row._mapping)
    print(d)
    jini_id = d['id']

print("\n=== INTERVIEWS for omi ===")
r3 = c.execute(text("SELECT id,candidate_id,status,ai_recommendation,behavior_score,answer_score,confidence_score,ai_interview_token,scheduled_time FROM interviews WHERE candidate_id=:cid"), {"cid": omi_id})
for row in r3:
    print(dict(row._mapping))

print(f"\n=== ASSIGNMENT CHECK ===")
print(f"omi assigned_to: {omi_assigned}")
print(f"jini user id:    {jini_id}")
print(f"Match: {str(omi_assigned) == str(jini_id)}")

print("\n=== ALL CANDIDATES with status ===")
r4 = c.execute(text("SELECT id,email,status,assigned_to FROM candidates"))
for row in r4:
    print(dict(row._mapping))

c.close()
