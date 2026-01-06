import httpx
import json
import asyncio
from typing import Optional, Dict, Any
import logging
from app.core.config import settings
from app.models.candidate import Candidate

logger = logging.getLogger(__name__)

# Global HTTP client with connection pooling for better performance
# This reuses connections instead of creating new ones for each request
_http_client: Optional[httpx.AsyncClient] = None


async def get_http_client() -> httpx.AsyncClient:
    """Get or create a shared HTTP client with connection pooling."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=50,
                keepalive_expiry=30.0,
            ),
        )
    return _http_client


async def close_http_client():
    """Close the shared HTTP client (call on app shutdown)."""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


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
            client = await get_http_client()
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
            client = await get_http_client()
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
    model = "gemini-1.5-flash"

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

    # Google Gemini API path (using v1beta for gemini-1.5-flash)
    base = "https://generativelanguage.googleapis.com/v1beta"
    endpoint = f"{base}/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {}
    # Use gemini_api_key first, fall back to ai_service_api_key for backward compatibility
    api_key = getattr(settings, "gemini_api_key", None) or settings.ai_service_api_key
    if api_key:
        params["key"] = api_key
    else:
        raise Exception("GEMINI_API_KEY environment variable is required for ATS analysis. Please set it in your .env file.")

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
                if resp.status_code >= 400:
                    error_body = resp.text
                    logger.error(f"Gemini API error {resp.status_code}: {error_body}")
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
    Generate a list of TECHNICAL interview questions given a job description.
    Returns: { "questions": ["q1", "q2", ...], "raw": <provider response> }
    """
    # Force Gemini model for question generation
    model = "gemini-1.5-flash"

    prompt = f"""You are an expert TECHNICAL interviewer for software engineering and tech roles.

JOB DESCRIPTION/ROLE:
{job_description}

Generate EXACTLY {max_questions} technical interview questions that would be asked TO A CANDIDATE applying for this role.

IMPORTANT RULES:
1. Questions must be TECHNICAL questions that test the candidate's skills
2. Questions should be what an interviewer would ASK the candidate, NOT questions about how to create interview questions
3. Include a mix of:
   - Technical concept questions (e.g., "Explain the difference between SQL and NoSQL databases")
   - Problem-solving questions (e.g., "How would you design a caching system for a high-traffic website?")
   - Experience-based questions (e.g., "Describe a complex bug you debugged and how you resolved it")
   - System design questions for senior roles (e.g., "Design a URL shortener service")
4. Questions should be appropriate for the seniority level mentioned in the job description
5. Each question should be clear, specific, and directly related to the technical requirements of the role

Return a JSON object with ONLY a "questions" key containing an array of {max_questions} question strings.
Example format: {{"questions": ["What is the time complexity of a binary search algorithm?", "Explain how you would implement authentication in a REST API", ...]}}

Return JSON only, no markdown, no explanation."""

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
    # Use gemini-1.5-flash as primary model
    model_to_use = "gemini-1.5-flash" if model in ["gemini-1.5-flash", None, ""] else model
    endpoint = f"{base}/models/{model_to_use}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {}
    # Use gemini_api_key first, fall back to ai_service_api_key for backward compatibility
    api_key = getattr(settings, "gemini_api_key", None) or settings.ai_service_api_key
    if api_key:
        params["key"] = api_key
    else:
        raise Exception("GEMINI_API_KEY environment variable is required for question generation. Please set it in your .env file.")

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
                if resp.status_code == 429:
                    logger.warning(f"Rate limited on {model_to_use}, attempt {attempt+1}")
                    await asyncio.sleep(5 * (attempt + 1))  # Longer delays: 5s, 10s, 15s
                    continue
                if resp.status_code >= 400:
                    error_body = resp.text
                    logger.error(f"Gemini API error {resp.status_code} for questions: {error_body}")
                resp.raise_for_status()
                data = resp.json()
            break
        except Exception as e:
            last_exc = e
            logger.warning(f"Gemini API attempt {attempt+1} failed for questions with {model_to_use}: {e}")
            await asyncio.sleep(3 * (attempt + 1))
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
        clean_text = clean_text.strip()
        
        logger.info(f"Parsing questions JSON: {clean_text[:200]}...")
        parsed = json.loads(clean_text)
        
        # Extract questions array from parsed JSON
        questions = parsed.get("questions") or parsed.get("items") or []
        
        # Ensure questions is a list of strings, not a nested structure
        if questions and isinstance(questions, list):
            # If first item is a dict or the entire JSON, extract properly
            if len(questions) > 0 and isinstance(questions[0], dict):
                # Questions might be in a different format
                questions = [q.get("text") or q.get("question") or str(q) for q in questions]
            # Filter to only include string items
            questions = [q for q in questions if isinstance(q, str) and len(q) > 10]
            
        logger.info(f"Extracted {len(questions)} questions from Gemini response")
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error for questions: {e}. Text: {text_output[:500]}")
        # fallback: split by newlines
        questions = [q.strip() for q in text_output.splitlines() if q.strip() and len(q.strip()) > 20][:max_questions]
    except Exception as e:
        logger.error(f"Error parsing questions: {e}")
        questions = [q.strip() for q in text_output.splitlines() if q.strip() and len(q.strip()) > 20][:max_questions]

    return {"questions": questions[:max_questions], "raw": data}


async def generate_ats_report_enhanced(resume_text: str, job_description: str = "", model: str | None = None) -> Dict[str, Any]:
    """
    Enhanced ATS report with detailed section-by-section analysis.
    Used for candidate-facing ATS checker tool.
    """
    # Use gemini-1.5-flash - verified available
    model = "gemini-1.5-flash"
    
    jd_context = ""
    if job_description:
        jd_context = f"\n\nTARGET JOB DESCRIPTION/ROLE:\n{job_description}\n\nAnalyze the resume specifically for this role. Check if the candidate's skills and experience align with this position."

    prompt = f"""You are an expert ATS (Applicant Tracking System) analyst. Analyze this resume and provide a detailed assessment.

RESUME:
{resume_text}
{jd_context}

Analyze the resume for ATS compatibility and provide specific, actionable feedback. Look at:
- Contact information completeness
- Format and structure clarity
- Work experience quality and quantification
- Skills relevance and presentation
- Education and certifications
- Keyword optimization for the target role

Provide your analysis as a JSON object with these exact fields:
- score: integer 0-100 overall ATS compatibility score
- summary: 2-3 sentence summary of the resume's ATS compatibility and overall quality
- section_scores: object with scores for each section (contact_info out of 5, format_structure out of 5, professional_summary out of 5, work_experience out of 5, technical_skills out of 5, education out of 5, keyword_optimization out of 5) - each with score and feedback
- highlights: array of 3-5 specific strengths found in this resume
- improvements: array of 5-7 specific, actionable improvements for this resume
- keywords_found: array of relevant technical/professional keywords found
- keywords_missing: array of important keywords that should be added for the target role
- formatting_issues: array of any formatting problems detected
- action_verbs_used: array of strong action verbs found in experience section
- quantified_achievements: integer count of achievements with numbers/metrics
- ats_friendly: boolean whether this resume will parse well in ATS systems

Be specific to THIS resume. Reference actual content from the resume in your feedback. Do not give generic advice.
Return ONLY valid JSON."""

    # Google Gemini API
    base = "https://generativelanguage.googleapis.com/v1beta"
    endpoint = f"{base}/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {}
    # Use gemini_api_key first, fall back to ai_service_api_key for backward compatibility
    api_key = getattr(settings, "gemini_api_key", None) or settings.ai_service_api_key
    if api_key:
        params["key"] = api_key
    else:
        raise Exception("GEMINI_API_KEY environment variable is required for ATS analysis. Please set it in your .env file.")

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192,  # Increased to prevent truncation
        }
    }
    
    last_exc = None
    for attempt in range(5):  # Increased retries
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(endpoint, json=body, headers=headers, params=params)
                
                # Handle rate limiting specifically
                if resp.status_code == 429:
                    wait_time = min(30, 5 * (attempt + 1))  # Wait longer for rate limits
                    logger.warning(f"Rate limited (429). Waiting {wait_time}s before retry {attempt+1}")
                    await asyncio.sleep(wait_time)
                    continue
                    
                resp.raise_for_status()
                data = resp.json()
            break
        except httpx.HTTPStatusError as e:
            last_exc = e
            if e.response.status_code == 429:
                wait_time = min(30, 5 * (attempt + 1))
                logger.warning(f"Rate limited (429). Waiting {wait_time}s before retry {attempt+1}")
                await asyncio.sleep(wait_time)
            else:
                logger.warning(f"Gemini API attempt {attempt+1} failed for ATS enhanced: {e}")
                await asyncio.sleep(2 ** attempt)
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
        clean_text = clean_text.strip()
        
        # Try to fix common JSON issues
        # Remove any trailing commas before closing braces/brackets
        import re
        clean_text = re.sub(r',\s*}', '}', clean_text)
        clean_text = re.sub(r',\s*]', ']', clean_text)
        
        parsed = json.loads(clean_text)
    except (json.JSONDecodeError, ValueError, Exception) as json_err:
        logger.warning(f"JSON decode error: {json_err}. Attempting to salvage partial data...")
        import re
        
        # Try to extract key fields even from truncated JSON
        parsed = {}
        
        # Extract score
        score_match = re.search(r'"score"\s*:\s*(\d+)', text_output)
        if score_match:
            parsed["score"] = int(score_match.group(1))
        
        # Extract summary
        summary_match = re.search(r'"summary"\s*:\s*"([^"]+)"', text_output)
        if summary_match:
            parsed["summary"] = summary_match.group(1)
        
        # Extract ats_friendly
        ats_match = re.search(r'"ats_friendly"\s*:\s*(true|false)', text_output, re.IGNORECASE)
        if ats_match:
            parsed["ats_friendly"] = ats_match.group(1).lower() == "true"
        
        # Extract arrays using regex
        def extract_array(key):
            pattern = rf'"{key}"\s*:\s*\[(.*?)\]'
            match = re.search(pattern, text_output, re.DOTALL)
            if match:
                items = re.findall(r'"([^"]+)"', match.group(1))
                return items[:10]  # Limit to 10 items
            return []
        
        parsed["highlights"] = extract_array("highlights") or ["Resume analyzed"]
        parsed["improvements"] = extract_array("improvements") or ["Continue improving your resume"]
        parsed["keywords_found"] = extract_array("keywords_found")
        parsed["keywords_missing"] = extract_array("keywords_missing")
        parsed["formatting_issues"] = extract_array("formatting_issues")
        parsed["action_verbs_used"] = extract_array("action_verbs_used")
        
        # Extract quantified_achievements
        quant_match = re.search(r'"quantified_achievements"\s*:\s*(\d+)', text_output)
        if quant_match:
            parsed["quantified_achievements"] = int(quant_match.group(1))
        
        # If we couldn't extract a score, try full JSON parse with fixes
        if "score" not in parsed:
            m = re.search(r"\{.*\}", text_output, re.DOTALL)
            if m:
                try:
                    extracted = m.group(0)
                    extracted = re.sub(r',\s*}', '}', extracted)
                    extracted = re.sub(r',\s*]', ']', extracted)
                    # Try to close unclosed strings and objects
                    if extracted.count('"') % 2 != 0:
                        extracted = extracted.rsplit('"', 1)[0] + '"'
                    parsed = json.loads(extracted)
                except:
                    pass
        
        # Set defaults for anything still missing
        if "score" not in parsed:
            parsed["score"] = 65  # Default middle score
        if "summary" not in parsed:
            parsed["summary"] = "Resume analysis completed with partial results. Some details may be incomplete."
        
        logger.info(f"Salvaged partial data: score={parsed.get('score')}, summary_len={len(parsed.get('summary', ''))}")

    return {
        "score": parsed.get("score", 0),
        "summary": parsed.get("summary", ""),
        "section_scores": parsed.get("section_scores") or {},
        "highlights": parsed.get("highlights") or [],
        "improvements": parsed.get("improvements") or parsed.get("recommendations") or [],
        "keywords_found": parsed.get("keywords_found") or [],
        "keywords_missing": parsed.get("keywords_missing") or [],
        "formatting_issues": parsed.get("formatting_issues") or [],
        "action_verbs_used": parsed.get("action_verbs_used") or [],
        "quantified_achievements": parsed.get("quantified_achievements", 0),
        "ats_friendly": parsed.get("ats_friendly", True),
    }


async def generate_interview_verdict(
    transcript: list,
    resume_text: str = "",
    ats_score: int | None = None,
    position: str = "",
    model: str | None = None
) -> Dict[str, Any]:
    """
    Generate a detailed interview verdict with AI analysis.
    Analyzes behavior, confidence, answer quality, and provides hiring recommendation.
    
    Returns: {
        recommendation: HIRE | REJECT | NEUTRAL,
        behavior_score: 0-100,
        confidence_score: 0-100,
        answer_score: 0-100,
        overall_score: 0-100,
        summary: str,
        strengths: list,
        weaknesses: list,
        detailed_feedback: str
    }
    """
    model = "gemini-1.5-flash"
    
    # Format transcript for AI
    transcript_text = "\n".join([
        f"[{msg.get('role', 'unknown').upper()}]: {msg.get('content', '')}"
        for msg in transcript
    ])
    
    # Build context sections
    ats_context = ""
    ats_weight_note = ""
    if ats_score is not None:
        ats_context = f"\nCandidate's Resume/ATS Score: {ats_score}/100"
        if ats_score >= 80:
            ats_weight_note = " (Strong resume - focus on interview performance)"
        elif ats_score >= 60:
            ats_weight_note = " (Adequate resume - interview performance is key)"
        else:
            ats_weight_note = " (Weak resume - exceptional interview needed to compensate)"
        ats_context += ats_weight_note + "\n"
    
    resume_context = ""
    if resume_text:
        resume_context = f"\nCandidate's Resume Summary:\n{resume_text[:2000]}\n"
    
    position_context = f"Position: {position}\n" if position else ""
    
    prompt = f"""You are an expert technical interview evaluator with 15+ years of hiring experience. Analyze this interview transcript and provide a comprehensive, production-ready evaluation.

{position_context}{ats_context}{resume_context}

INTERVIEW TRANSCRIPT:
{transcript_text}

EVALUATION CRITERIA:

1. **TECHNICAL COMPETENCE** (40% weight)
   - Accuracy of technical answers
   - Depth of knowledge demonstrated
   - Problem-solving approach
   - Understanding of concepts

2. **COMMUNICATION SKILLS** (25% weight)
   - Clarity of explanations
   - Ability to articulate complex ideas
   - Listening and comprehension
   - Professional language

3. **BEHAVIORAL INDICATORS** (20% weight)
   - Professionalism and attitude
   - Enthusiasm for the role
   - Team collaboration signals
   - Cultural fit indicators

4. **CONFIDENCE & COMPOSURE** (15% weight)
   - Self-assurance in responses
   - Handling of difficult questions
   - Recovery from mistakes
   - Poise under pressure

{"IMPORTANT: The candidate's ATS/Resume score is " + str(ats_score) + "/100. Factor this into your final recommendation - a low resume score requires stronger interview performance to compensate." if ats_score is not None else ""}

Return a JSON object with EXACTLY these keys:
{{
    "recommendation": "HIRE" | "REJECT" | "NEUTRAL",
    "behavior_score": <integer 0-100>,
    "confidence_score": <integer 0-100>,
    "answer_score": <integer 0-100>,
    "overall_score": <integer 0-100 - weighted average considering all factors{" including ATS score" if ats_score is not None else ""}>,
    "summary": "<2-3 sentence executive summary of candidate's performance>",
    "strengths": ["<specific strength 1>", "<specific strength 2>", ...],
    "weaknesses": ["<area for improvement 1>", "<area for improvement 2>", ...],
    "detailed_feedback": "<1 paragraph detailed feedback for hiring team>",
    "technical_assessment": "<brief assessment of technical capabilities>",
    "hiring_risk": "LOW" | "MEDIUM" | "HIGH",
    "key_answers": [
        {{"question": "<question text>", "answer_summary": "<answer summary>", "rating": "EXCELLENT" | "GOOD" | "FAIR" | "POOR"}},
        ...
    ]
}}

RECOMMENDATION RULES:
- **HIRE**: overall_score >= 70 AND answer_score >= 65 AND no major red flags
- **REJECT**: overall_score < 45 OR answer_score < 40 OR critical red flags (dishonesty, unprofessionalism, lack of basic knowledge)
- **NEUTRAL**: All other cases requiring human review

Be thorough and specific. Base your evaluation on actual transcript content, not assumptions.
Return ONLY valid JSON, no markdown, no explanation."""

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
            "maxOutputTokens": 4096,
        }
    }
    
    last_exc = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(endpoint, json=body, headers=headers, params=params)
                resp.raise_for_status()
                data = resp.json()
            break
        except Exception as e:
            last_exc = e
            logger.warning(f"Gemini API attempt {attempt+1} failed for verdict: {e}")
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
        logger.error(f"No text output from Gemini for verdict: {data}")
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
            # Fallback to basic scoring
            parsed = {
                "recommendation": "NEUTRAL",
                "behavior_score": 50,
                "confidence_score": 50,
                "answer_score": 50,
                "overall_score": 50,
                "summary": "Unable to fully analyze the interview transcript.",
                "strengths": [],
                "weaknesses": [],
                "detailed_feedback": "Manual review recommended."
            }

    return {
        "recommendation": parsed.get("recommendation", "NEUTRAL"),
        "behavior_score": parsed.get("behavior_score", 50),
        "confidence_score": parsed.get("confidence_score", 50),
        "answer_score": parsed.get("answer_score", 50),
        "overall_score": parsed.get("overall_score", 50),
        "summary": parsed.get("summary", ""),
        "strengths": parsed.get("strengths") or [],
        "weaknesses": parsed.get("weaknesses") or [],
        "detailed_feedback": parsed.get("detailed_feedback", ""),
        "technical_assessment": parsed.get("technical_assessment", ""),
        "hiring_risk": parsed.get("hiring_risk", "MEDIUM"),
        "key_answers": parsed.get("key_answers") or [],
        "raw": data
    }
