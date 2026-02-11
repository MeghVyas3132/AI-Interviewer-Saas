"""Check interview round details."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql://postgres:root@localhost:5432/ai_interviewer_db")
Session = sessionmaker(bind=engine)
session = Session()

# Check interview_round
round_data = session.execute(text("""
    SELECT id, candidate_id, company_id, status, interview_mode, scheduled_at
    FROM interview_rounds 
    WHERE id = 'aa22a4e9-cf43-4e87-bacc-da959226b0d1'
""")).fetchone()

if round_data:
    print(f"Round ID: {round_data.id}")
    print(f"candidate_id in interview_rounds: {round_data.candidate_id}")
    print(f"company_id: {round_data.company_id}")
    print(f"status: {round_data.status}")
    print(f"mode: {round_data.interview_mode}")
    print(f"scheduled_at: {round_data.scheduled_at}")

# Check vivek's user and candidate IDs
print("\n--- Checking vivek's IDs ---")

# As candidate (in candidates table)
candidate = session.execute(text("""
    SELECT id, email FROM candidates WHERE email = 'vivek@gmail.com'
""")).fetchone()
if candidate:
    print(f"Candidate table ID: {candidate.id}")

# As user (in users table)
user = session.execute(text("""
    SELECT id, email, role FROM users WHERE email = 'vivek@gmail.com'
""")).fetchone()
if user:
    print(f"User table ID: {user.id}")
    print(f"User role: {user.role}")

session.close()
