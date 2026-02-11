"""Debug vivek's interview rounds"""
import sys
sys.path.insert(0, '.')

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models import Candidate, InterviewRound, User

# Create sync engine
engine = create_engine(settings.database_url.replace('+asyncpg', ''))
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

# Find vivek user
user = db.query(User).filter(User.email == 'vivek@gmail.com').first()
print(f'User: {user.email if user else None}, id: {user.id if user else None}, role: {user.role if user else None}')

# Find candidate record
candidate = db.query(Candidate).filter(Candidate.email == 'vivek@gmail.com').first()
print(f'Candidate: {candidate.email if candidate else None}, id: {candidate.id if candidate else None}')

# Find interview rounds for this candidate
if candidate:
    rounds = db.query(InterviewRound).filter(InterviewRound.candidate_id == candidate.id).all()
    print(f'Rounds for candidate: {len(rounds)}')
    for r in rounds:
        print(f'  Round: {r.id}')
        print(f'    status: {r.status}')
        print(f'    mode: {r.interview_mode}')
        print(f'    meeting_id: {r.videosdk_meeting_id}')
        print(f'    scheduled_at: {r.scheduled_at}')

# Also check all IN_PROGRESS rounds
print('\n--- All IN_PROGRESS or SCHEDULED rounds ---')
all_rounds = db.query(InterviewRound).filter(
    InterviewRound.status.in_(['SCHEDULED', 'IN_PROGRESS'])
).all()
for r in all_rounds:
    cand = db.query(Candidate).filter(Candidate.id == r.candidate_id).first()
    print(f'Round {r.id}: candidate={cand.email if cand else None}, status={r.status}, mode={r.interview_mode}')

db.close()
