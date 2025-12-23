import httpx
import json
import asyncio
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

async def generate_ats_report(resume_text: str, max_output_tokens: int = 512, model: str | None = None) -> Dict[str, Any]:
    """
    Call configured AI provider to produce a structured ATS report.
    Supports Groq (when GROQ key present) and Google Gemini API as fallback.
    Includes simple retries/backoff for transient failures.
    """
    # Force Gemini model
    model = "gemini-2.5-flash"

    prompt = (
        "You are an expert applicant-tracking-system (ATS) evaluator. "
        "Given the candidate resume text, return a strict JSON object with the following keys:\n"
        "- score: integer 0-100 representing ATS fit for the role\n"
        "- summary: short plain-text summary (1-3 sentences)\n"
        "- issues: list of strings describing missing keywords, formatting, or problems\n"
        "- recommendations: list of actionable suggestions to improve ATS compatibility\n"
        "Respond with JSON only and nothing else. If a value is missing, return null or an empty list.\n\n"
        f"Resume:\n{resume_text}\n\nJSON:\n"
    )

    # Groq path if configured
    if getattr(settings, "groq_api_key", None):
        groq_url = getattr(settings, "groq_api_url", "https://api.groq.ai").rstrip('/')
        headers = {"Content-Type": "application/json", "x-api-key": settings.groq_api_key}
        body = {"model": model or "groq-1", "input": prompt}
        last_exc = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(f"{groq_url}/v1/generate", json=body, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                break
            except Exception as e:
                last_exc = e
                await asyncio.sleep(2 ** attempt)
        else:
            raise last_exc

        text_output = None
        if isinstance(data, dict):
            for key in ("output", "generated_text", "text", "result", "data"):
                if key in data and isinstance(data[key], str):
                    text_output = data[key]
                    break
            if not text_output and "outputs" in data and isinstance(data["outputs"], list) and data["outputs"]:
                o = data["outputs"][0]
                if isinstance(o, dict):
                    text_output = o.get("text") or o.get("generated_text")

        if not text_output:
            text_output = json.dumps(data)

        try:
            parsed = json.loads(text_output)
        except Exception:
            parsed = {"score": None, "summary": text_output, "issues": [], "recommendations": []}

        report = {
            "score": parsed.get("score"),
            "summary": parsed.get("summary"),
            "issues": parsed.get("issues") or [],
            "recommendations": parsed.get("recommendations") or [],
            "raw": data,
        }

        return report

    # Google Gemini API path (using v1beta for gemini-2.5-flash)
    base = "https://generativelanguage.googleapis.com/v1beta"
    endpoint = f"{base}/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {}
    if settings.ai_service_api_key:
        params["key"] = settings.ai_service_api_key

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": max_output_tokens,
        }
    }
    last_exc = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(endpoint, json=body, headers=headers, params=params)
                resp.raise_for_status()
                data = resp.json()
            break
        except Exception as e:
            last_exc = e
            logger.warning(f"Gemini API attempt {attempt+1} failed: {e}")
            await asyncio.sleep(2 ** attempt)
    else:
        raise last_exc

    # Extract text output from Gemini response format
    text_output = None
    if isinstance(data, dict):
        candidates = data.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if parts:
                text_output = parts[0].get("text")

    if not text_output:
        logger.error(f"No text output from Gemini: {data}")
        raise Exception("No textual response from AI provider")

    try:
        # Clean markdown code blocks if present
        clean_text = text_output.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        parsed = json.loads(clean_text.strip())
    except Exception:
        import re
        m = re.search(r"\{.*\}", text_output, re.DOTALL)
        if m:
            parsed = json.loads(m.group(0))
        else:
            raise

    report = {
        "score": parsed.get("score"),
        "summary": parsed.get("summary"),
        "issues": parsed.get("issues") or [],
        "recommendations": parsed.get("recommendations") or [],
        "raw": data,
    }

    return report


async def generate_questions(job_description: str, max_questions: int = 10, model: str | None = None) -> Dict[str, Any]:
    """
    Generate a list of interview questions given a job description.
    Returns: { "questions": ["q1", "q2", ...], "raw": <provider response> }
    """
    # Force Gemini model for question generation - ignore invalid model names
    model = "gemini-2.5-flash"

    prompt = (
        "You are an expert hiring manager. Given the following job description, return a JSON object with a key 'questions' containing an array of up to "
        f"{max_questions} concise interview questions tailored to the role. Return JSON only, no markdown.\n\nJob Description:\n{job_description}\n\nJSON:\n"
    )

    # If Groq is configured prefer Groq
    if getattr(settings, "groq_api_key", None):
        groq_url = getattr(settings, "groq_api_url", "https://api.groq.ai").rstrip('/')
        headers = {"Content-Type": "application/json", "x-api-key": settings.groq_api_key}
        body = {"model": model or "groq-1", "input": prompt}
        # simple retries
        last_exc = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(f"{groq_url}/v1/generate", json=body, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                break
            except Exception as e:
                last_exc = e
                await asyncio.sleep(2 ** attempt)
        else:
            raise last_exc

        # extract text
        text_output = None
        if isinstance(data, dict):
            for k in ("output", "generated_text", "text", "result"):
                if k in data and isinstance(data[k], str):
                    text_output = data[k]
                    break
            if not text_output and "outputs" in data and isinstance(data["outputs"], list) and data["outputs"]:
                o = data["outputs"][0]
                if isinstance(o, dict):
                    text_output = o.get("text") or o.get("generated_text")

        if not text_output:
            text_output = json.dumps(data)

        try:
            parsed = json.loads(text_output)
            questions = parsed.get("questions") or parsed.get("items") or []
        except Exception:
            # fallback: split by newlines
            questions = [q.strip() for q in text_output.splitlines() if q.strip()][:max_questions]

        return {"questions": questions[:max_questions], "raw": data}

    # Google Gemini API path
    base = "https://generativelanguage.googleapis.com/v1beta"
    endpoint = f"{base}/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {}
    if settings.ai_service_api_key:
        params["key"] = settings.ai_service_api_key

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 2048,
        }
    }

    last_exc = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(endpoint, json=body, headers=headers, params=params)
                resp.raise_for_status()
                data = resp.json()
            break
        except Exception as e:
            last_exc = e
            logger.warning(f"Gemini API attempt {attempt+1} failed for questions: {e}")
            await asyncio.sleep(2 ** attempt)
    else:
        raise last_exc

    # Extract textual output from Gemini response format
    text_output = None
    if isinstance(data, dict):
        candidates = data.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if parts:
                text_output = parts[0].get("text")

    if not text_output:
        logger.error(f"No text output from Gemini for questions: {data}")
        text_output = json.dumps(data)

    try:
        # Clean markdown code blocks if present
        clean_text = text_output.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        parsed = json.loads(clean_text.strip())
        questions = parsed.get("questions") or parsed.get("items") or []
    except Exception:
        questions = [q.strip() for q in text_output.splitlines() if q.strip()][:max_questions]

    return {"questions": questions[:max_questions], "raw": data}


async def generate_ats_report_enhanced(resume_text: str, job_description: str = "", model: str | None = None) -> Dict[str, Any]:
    """
    Enhanced ATS report with more detailed analysis including keywords matching.
    Used for candidate-facing ATS checker tool.
    """
    # Force Gemini model
    model = "gemini-2.5-flash"
    
    jd_context = ""
    if job_description:
        jd_context = f"\n\nJob Description to match against:\n{job_description}\n"

    prompt = (
        "You are an expert applicant-tracking-system (ATS) evaluator and career coach. "
        "Analyze the following resume and return a detailed JSON assessment.\n\n"
        f"Resume:\n{resume_text}"
        f"{jd_context}\n\n"
        "Return a JSON object with EXACTLY these keys:\n"
        "- score: integer 0-100 representing overall ATS compatibility\n"
        "- summary: 1-2 sentence summary of the resume's ATS compatibility\n"
        "- highlights: array of 3-5 strengths found in the resume\n"
        "- improvements: array of 3-5 specific actionable suggestions to improve ATS score\n"
        "- keywords_found: array of important keywords/skills found in the resume\n"
        "- keywords_missing: array of important keywords/skills that should be added (especially if job description provided)\n"
        "\nReturn ONLY valid JSON, no markdown formatting, no explanation."
    )

    # Google Gemini API
    base = "https://generativelanguage.googleapis.com/v1beta"
    endpoint = f"{base}/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {}
    if settings.ai_service_api_key:
        params["key"] = settings.ai_service_api_key

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
        }
    }
    
    last_exc = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(endpoint, json=body, headers=headers, params=params)
                resp.raise_for_status()
                data = resp.json()
            break
        except Exception as e:
            last_exc = e
            logger.warning(f"Gemini API attempt {attempt+1} failed for ATS enhanced: {e}")
            await asyncio.sleep(2 ** attempt)
    else:
        raise last_exc

    # Extract text output from Gemini response
    text_output = None
    if isinstance(data, dict):
        candidates = data.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if parts:
                text_output = parts[0].get("text")

    if not text_output:
        logger.error(f"No text output from Gemini for ATS enhanced: {data}")
        raise Exception("No textual response from AI provider")

    try:
        # Clean markdown code blocks if present
        clean_text = text_output.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        parsed = json.loads(clean_text.strip())
    except Exception:
        import re
        m = re.search(r"\{.*\}", text_output, re.DOTALL)
        if m:
            parsed = json.loads(m.group(0))
        else:
            # Return a default response if parsing fails
            parsed = {
                "score": 50,
                "summary": "Unable to fully analyze resume",
                "highlights": [],
                "improvements": ["Ensure resume is in a clear, readable format"],
                "keywords_found": [],
                "keywords_missing": []
            }

    return {
        "score": parsed.get("score", 0),
        "summary": parsed.get("summary", ""),
        "highlights": parsed.get("highlights") or [],
        "improvements": parsed.get("improvements") or parsed.get("recommendations") or [],
        "keywords_found": parsed.get("keywords_found") or [],
        "keywords_missing": parsed.get("keywords_missing") or [],
    }

