import httpx
from typing import Optional, Dict, Any
import logging
from app.core.config import settings
from app.models.candidate import Candidate

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        self.base_url = settings.ai_service_url.rstrip('/')
        # Use a fallback key for development if not set in env
        self.api_key = settings.ai_service_api_key or "ai-interviewer-secret-key"
        self.headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key
        }

    async def sync_candidate(self, candidate: Candidate) -> int:
        """
        Sync candidate to AI Service. Returns AI Service Candidate ID.
        """
        url = f"{self.base_url}/api/admin/candidates"
        # Handle missing names by using email or placeholder
        first_name = candidate.first_name
        last_name = candidate.last_name
        
        if not first_name:
            # Try to extract from email
            if candidate.email:
                parts = candidate.email.split('@')[0].split('.')
                first_name = parts[0]
                if len(parts) > 1:
                    last_name = parts[1]
            
        if not first_name:
            first_name = "Candidate"
            
        if not last_name:
            last_name = "User"

        payload = {
            "first_name": first_name,
            "last_name": last_name,
            "email": candidate.email,
            "phone": candidate.phone,
            "resume_url": candidate.resume_url
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=self.headers)
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    # Response format: { success: true, data: { candidate_id: ... } }
                    candidate_id = data['data']['candidate_id']
                    logger.info(f"Successfully synced candidate {candidate.email} to AI Service. AI Candidate ID: {candidate_id}")
                    return candidate_id
                elif response.status_code == 409:
                    data = response.json()
                    # Response format: { success: false, error: ..., candidate: { candidate_id: ... } }
                    candidate_id = data['candidate']['candidate_id']
                    logger.info(f"Candidate {candidate.email} already exists in AI Service. Using existing AI Candidate ID: {candidate_id}")
                    return candidate_id
                else:
                    logger.error(f"Failed to sync candidate: {response.status_code} {response.text}")
                    raise Exception(f"Failed to sync candidate: {response.text}")
        except Exception as e:
            logger.error(f"Error calling AI Service sync_candidate: {str(e)}")
            raise

    async def create_interview_session(self, ai_candidate_id: int, exam_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Create interview session in AI Service.
        """
        url = f"{self.base_url}/api/admin/interview-sessions"
        payload = {
            "candidateId": ai_candidate_id,
            "examId": exam_id,
            "sendEmail": False  # We handle email in backend
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=self.headers)
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    logger.info(f"Successfully created interview session for AI Candidate ID {ai_candidate_id}")
                    return data['data']
                else:
                    logger.error(f"Failed to create interview session: {response.status_code} {response.text}")
                    raise Exception(f"Failed to create interview session: {response.text}")
        except Exception as e:
            logger.error(f"Error calling AI Service create_interview_session: {str(e)}")
            raise

ai_service = AIService()
