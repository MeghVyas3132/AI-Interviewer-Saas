"""Test the my-interviews API"""
import sys
sys.path.insert(0, '.')

import asyncio
from sqlalchemy import create_engine, select, and_, or_
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models import Candidate, InterviewRound, User, Company
from app.models.interview_round import RoundStatus

# Create sync engine
engine = create_engine(settings.database_url.replace('+asyncpg', ''))
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

# Test as vivek@gmail.com
email = 'vivek@gmail.com'

# Get user
user = db.query(User).filter(User.email == email).first()
print(f'User: {user.email}, id: {user.id}, company_id: {user.company_id}')

# Get candidate (simulating the query in my-interviews)
candidate = db.query(Candidate).filter(
    and_(
        Candidate.email == user.email,
        Candidate.company_id == user.company_id
    )
).first()

if not candidate:
    print('ERROR: Candidate not found!')
    print(f'  Looking for email={user.email}, company_id={user.company_id}')
    
    # Check if candidate exists at all
    any_candidate = db.query(Candidate).filter(Candidate.email == email).first()
    if any_candidate:
        print(f'  Found candidate with different company: {any_candidate.id}, company_id={any_candidate.company_id}')
else:
    print(f'Candidate found: {candidate.id}')
    
    # Query interview rounds (same logic as in endpoint)
    rounds = db.query(InterviewRound).filter(
        or_(
            InterviewRound.candidate_id == candidate.id,
            InterviewRound.candidate_id == user.id
        ),
        InterviewRound.status.in_([RoundStatus.SCHEDULED, RoundStatus.IN_PROGRESS])
    ).all()
    
    print(f'\nInterview rounds found: {len(rounds)}')
    for r in rounds:
        print(f'  Round {r.id}: status={r.status}, mode={r.interview_mode}')

db.close()
