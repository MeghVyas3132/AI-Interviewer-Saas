"""Check and set video credentials for interview round."""
import os
import sys
import uuid
import jwt
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql://postgres:root@localhost:5432/ai_interviewer_db")
Session = sessionmaker(bind=engine)
session = Session()

# Check interview round
round_data = session.execute(text("""
    SELECT id, videosdk_meeting_id, videosdk_token, scheduled_at, status
    FROM interview_rounds 
    WHERE id = 'aa22a4e9-cf43-4e87-bacc-da959226b0d1'
""")).fetchone()

if round_data:
    print(f"Round ID: {round_data.id}")
    print(f"VideoSDK Meeting ID: {round_data.videosdk_meeting_id}")
    print(f"VideoSDK Token: {'Set' if round_data.videosdk_token else 'Not set'}")
    print(f"Scheduled At: {round_data.scheduled_at}")
    print(f"Status: {round_data.status}")
    
    if not round_data.videosdk_meeting_id or not round_data.videosdk_token:
        print("\n--- Video credentials not set. Need to generate them. ---")
        print("The employee needs to start the interview to generate video credentials.")
        print("Or we can generate them manually using VideoSDK API.")
    else:
        print("\n✅ Video credentials are set. Candidate should be able to join.")

session.close()
