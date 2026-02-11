"""Test question generation end-to-end."""
import asyncio
import httpx
import json

BASE_URL = "http://localhost:8000/api/v1"

async def test_question_generation():
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Login as HR
        print("1. Logging in as HR...")
        login_resp = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": "hr@aiinterviewer.com", "password": "HrPass123!"}
        )
        if login_resp.status_code != 200:
            print(f"Login failed: {login_resp.text}")
            return
        
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"   Token: {token[:50]}...")
        
        # 2. List jobs
        print("\n2. Listing jobs...")
        jobs_resp = await client.get(f"{BASE_URL}/jobs", headers=headers)
        jobs = jobs_resp.json()
        print(f"   Found {len(jobs)} jobs")
        
        # 3. Create a job if none exists
        if not jobs:
            print("\n3. Creating a test job...")
            job_data = {
                "title": "Senior Python Developer",
                "description": "We are looking for an experienced Python developer with knowledge of FastAPI, Django, PostgreSQL, Docker, and AWS. Must have 5+ years of experience in backend development.",
                "ai_prompt": "Python backend developer with FastAPI, Django, PostgreSQL experience"
            }
            create_resp = await client.post(f"{BASE_URL}/jobs", headers=headers, json=job_data)
            if create_resp.status_code != 201:
                print(f"   Failed to create job: {create_resp.status_code} - {create_resp.text}")
                return
            job = create_resp.json()
            job_id = job["id"]
            print(f"   Created job: {job_id} - {job['title']}")
        else:
            job_id = jobs[0]["id"]
            print(f"   Using existing job: {job_id}")
        
        # 4. Trigger question generation
        print(f"\n4. Triggering question generation for job {job_id}...")
        gen_resp = await client.post(f"{BASE_URL}/jobs/{job_id}/generate-questions", headers=headers)
        print(f"   Response: {gen_resp.status_code} - {gen_resp.text}")
        
        # 5. Wait and check for questions
        print("\n5. Waiting for questions to be generated...")
        for i in range(10):
            await asyncio.sleep(2)
            q_resp = await client.get(f"{BASE_URL}/jobs/{job_id}/questions", headers=headers)
            questions = q_resp.json()
            print(f"   Attempt {i+1}: Found {len(questions)} questions")
            if questions:
                print("\n   Generated Questions:")
                for j, q in enumerate(questions, 1):
                    print(f"   {j}. {q['text'][:100]}...")
                return
        
        print("\n   No questions generated after 20 seconds.")
        print("   Check Celery worker logs for errors.")

if __name__ == "__main__":
    asyncio.run(test_question_generation())
