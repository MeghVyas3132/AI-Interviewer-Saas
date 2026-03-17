import httpx
import json
import asyncio
import random
import re
from typing import Optional, Dict, Any, List
import logging
from app.core.config import settings
from app.models.candidate import Candidate

logger = logging.getLogger(__name__)

_GENERIC_QA_OPINIONS = (
    "answer was clear and relevant to the question.",
    "answer addressed the question well and demonstrated practical understanding.",
    "answer partially addressed the question and lacked depth in key areas.",
)
_GENERIC_QA_IMPROVEMENTS = (
    "add concrete implementation details and trade-offs from real projects.",
    "maintain this quality and keep answers concise with measurable impact.",
    "add measurable outcomes or concrete trade-offs to strengthen the response.",
)
_COMMON_STOPWORDS = {
    "what", "when", "where", "which", "while", "would", "could", "should", "about",
    "their", "there", "these", "those", "your", "with", "from", "into", "have",
    "this", "that", "then", "than", "them", "they", "were", "been", "being", "also",
    "explain", "describe", "design", "implement", "across", "please", "how", "for",
    "and", "the", "are", "you", "why", "use", "used", "using", "into", "over",
}
_MAX_ATS_RESUME_CHARS = 12000
_MAX_ATS_JOB_DESC_CHARS = 3000


def _clip_text(value: str, max_chars: int) -> str:
    text = (value or "").strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars]


def _extract_ats_keywords(text: str, limit: int = 25) -> List[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9+#/.\-]{2,}", (text or "").lower())
    deduped: List[str] = []
    for token in tokens:
        if token in _COMMON_STOPWORDS:
            continue
        if token not in deduped:
            deduped.append(token)
        if len(deduped) >= limit:
            break
    return deduped


def _heuristic_ats_report_enhanced(resume_text: str, job_description: str = "") -> Dict[str, Any]:
    resume = (resume_text or "").strip()
    job_desc = (job_description or "").strip()
    resume_lower = resume.lower()

    email_present = bool(re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", resume))
    phone_present = bool(re.search(r"\+?\d[\d\-\s()]{7,}\d", resume))
    bullet_count = len(re.findall(r"(^|\n)\s*[-*•]\s+", resume))
    metrics_count = len(re.findall(r"\b\d+(?:\.\d+)?\s*(?:%|x|ms|s|k|m|b|yrs?|years?)\b", resume_lower))

    action_verbs_catalog = [
        "built", "designed", "implemented", "delivered", "optimized", "automated",
        "led", "improved", "deployed", "managed", "migrated", "integrated",
    ]
    action_verbs_used = [verb for verb in action_verbs_catalog if re.search(rf"\b{verb}\b", resume_lower)]

    skill_catalog = [
        "python", "react", "docker", "kubernetes", "terraform", "aws", "gcp", "azure",
        "ci/cd", "jenkins", "github", "gitlab", "prometheus", "grafana", "linux", "sql",
    ]
    skills_found = [skill for skill in skill_catalog if skill in resume_lower]

    jd_keywords = _extract_ats_keywords(job_desc, limit=20)
    resume_keywords = set(_extract_ats_keywords(resume, limit=200))
    keywords_found = [keyword for keyword in jd_keywords if keyword in resume_keywords]
    keywords_missing = [keyword for keyword in jd_keywords if keyword not in resume_keywords]

    score = 35
    if email_present:
        score += 10
    if phone_present:
        score += 5
    score += min(12, bullet_count * 2)
    score += min(15, metrics_count * 3)
    score += min(15, len(skills_found) * 2)

    if jd_keywords:
        score += int((len(keywords_found) / max(len(jd_keywords), 1)) * 23)
    else:
        score += 8

    score = max(0, min(100, score))

    if score >= 80:
        summary = "Resume appears ATS-friendly with strong structure, relevant skills, and measurable experience."
    elif score >= 65:
        summary = "Resume is reasonably ATS-compatible but can be improved with clearer role-aligned keywords and quantified impact."
    else:
        summary = "Resume needs ATS improvements in structure, keyword targeting, and measurable achievements."

    highlights: List[str] = []
    if email_present and phone_present:
        highlights.append("Contact information is present and parseable.")
    if skills_found:
        highlights.append(f"Relevant technical skills detected: {', '.join(skills_found[:5])}.")
    if metrics_count > 0:
        highlights.append(f"Contains {metrics_count} quantified achievement(s), which improves ATS ranking.")
    if not highlights:
        highlights.append("Resume text was extracted successfully for ATS analysis.")

    improvements: List[str] = []
    if not phone_present:
        improvements.append("Add a phone number in a standard format for reliable ATS parsing.")
    if not jd_keywords:
        improvements.append("Include role-specific keywords from the job description in skills and experience sections.")
    elif keywords_missing:
        improvements.append(f"Add missing role keywords: {', '.join(keywords_missing[:6])}.")
    if metrics_count < 2:
        improvements.append("Add measurable outcomes (%, latency, cost, uptime, delivery speed) to recent experience.")
    if bullet_count < 3:
        improvements.append("Use concise bullet points for experience sections to improve ATS readability.")
    if len(action_verbs_used) < 3:
        improvements.append("Use stronger action verbs (e.g., built, optimized, automated, led) in achievement statements.")
    if len(improvements) < 3:
        improvements.append("Align resume headline and summary with the target role title and core stack.")

    section_scores = {
        "contact_info": {"score": 5 if (email_present and phone_present) else 3, "feedback": "Contact details should include email and phone."},
        "format_structure": {"score": 4 if bullet_count >= 3 else 3, "feedback": "Clear headings and bullet points improve ATS extraction."},
        "professional_summary": {"score": 4, "feedback": "Tailor summary to target role and technical scope."},
        "work_experience": {"score": min(5, 2 + metrics_count), "feedback": "Quantified impact and ownership improve ranking."},
        "technical_skills": {"score": min(5, 2 + len(skills_found) // 2), "feedback": "Explicitly list core tools and platforms used in production."},
        "education": {"score": 4, "feedback": "Keep education concise and include relevant certifications."},
        "keyword_optimization": {"score": min(5, 1 + (len(keywords_found) // 2)) if jd_keywords else 3, "feedback": "Match job-description terminology across skills and experience."},
    }

    return {
        "score": score,
        "summary": summary,
        "section_scores": section_scores,
        "highlights": highlights[:5],
        "improvements": improvements[:7],
        "keywords_found": keywords_found[:12] if keywords_found else skills_found[:12],
        "keywords_missing": keywords_missing[:12],
        "formatting_issues": [] if bullet_count >= 2 else ["Experience section has limited bullet structure."],
        "action_verbs_used": action_verbs_used[:12],
        "quantified_achievements": metrics_count,
        "ats_friendly": score >= 65,
    }


def _extract_question_keywords(question: str, limit: int = 6) -> List[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9+#/.\-]{2,}", question.lower())
    deduped: List[str] = []
    for token in tokens:
        if token in _COMMON_STOPWORDS:
            continue
        if token not in deduped:
            deduped.append(token)
        if len(deduped) >= limit:
            break
    return deduped


def _derive_focus_area(question: str) -> str:
    q = question.lower()
    mapping = (
        (("ci/cd", "pipeline", "release", "deployment"), "delivery pipeline design"),
        (("kubernetes", "pods", "cluster", "k8s"), "Kubernetes operations"),
        (("secret", "vault", "credential", "token"), "security and secret management"),
        (("observability", "monitor", "metrics", "logs", "traces"), "observability strategy"),
        (("incident", "outage", "latency", "rollback"), "incident handling"),
        (("cost", "optimize", "spend", "efficiency"), "cost optimization"),
        (("system", "architecture", "scalability", "design"), "system design reasoning"),
    )
    for keywords, label in mapping:
        if any(keyword in q for keyword in keywords):
            return label
    return "the core question requirement"


def _is_generic_qa_feedback(text: str, *, kind: str) -> bool:
    normalized = (text or "").strip().lower()
    if not normalized:
        return True
    generic_pool = _GENERIC_QA_OPINIONS if kind == "opinion" else _GENERIC_QA_IMPROVEMENTS
    return any(generic in normalized for generic in generic_pool)


def _build_contextual_qa_feedback(question: str, answer: str, score: int) -> Dict[str, str]:
    answer_lower = answer.lower()
    focus_area = _derive_focus_area(question)
    keywords = _extract_question_keywords(question)
    matched_keywords = [keyword for keyword in keywords if keyword in answer_lower]
    missing_keywords = [keyword for keyword in keywords if keyword not in answer_lower]
    uncertain = any(
        phrase in answer_lower
        for phrase in ("don't know", "not sure", "no idea", "can't recall", "unsure", "maybe")
    )
    has_numbers = bool(re.search(r"\d", answer))
    has_tools = any(tool in answer_lower for tool in ("kubernetes", "terraform", "docker", "prometheus", "grafana", "aws", "gcp", "azure", "ci/cd", "pipeline"))
    answer_length = len(answer.strip())

    if uncertain or score < 50:
        opinion = (
            f"The response on {focus_area} was uncertain and did not sufficiently address critical parts of the prompt."
        )
    elif score < 70:
        opinion = (
            f"The response on {focus_area} touched the right direction but missed depth on {', '.join(missing_keywords[:2]) or 'key implementation details'}."
        )
    elif score < 85:
        opinion = (
            f"The response on {focus_area} was relevant and reasonably structured, with room to improve depth and trade-off discussion."
        )
    else:
        opinion = (
            f"The response on {focus_area} was strong, with clear reasoning and practical implementation context."
        )

    if score >= 85 and (has_numbers or has_tools):
        improvement = "Maintain this level; keep highlighting measurable outcomes and explicit trade-offs."
    elif uncertain or score < 50:
        improvement = (
            f"Provide a concrete approach for {focus_area}, including architecture steps, tooling choices, and validation checks."
        )
    elif missing_keywords:
        improvement = (
            f"Strengthen this answer by explicitly covering {', '.join(missing_keywords[:2])} and linking them to a real project scenario."
        )
    elif answer_length < 120:
        improvement = "Add one concrete production example, including metrics and failure-handling trade-offs."
    else:
        improvement = "Add measurable impact (latency, reliability, or cost) to make the answer decision-ready."

    return {"opinion": opinion, "improvement": improvement}

# Global HTTP client with connection pooling for better performance
# This reuses connections instead of creating new ones for each request
_http_client: Optional[httpx.AsyncClient] = None

# API Key rotation for rate limit mitigation
_groq_key_index = 0
_gemini_key_index = 0


def get_groq_api_key() -> str:
    """
    Get a Groq API key, rotating through multiple keys if available.
    Set GROQ_API_KEYS as comma-separated list for rotation, or use single key.
    """
    global _groq_key_index
    
    # Check for multiple keys (comma-separated)
    multi_keys = getattr(settings, "groq_api_keys", "")
    if multi_keys:
        keys = [k.strip() for k in multi_keys.split(",") if k.strip()]
        if keys:
            # Round-robin rotation
            key = keys[_groq_key_index % len(keys)]
            _groq_key_index += 1
            logger.info(f"Using Groq API key {(_groq_key_index % len(keys)) + 1}/{len(keys)}")
            return key
    
    # Fall back to single key
    groq_key = getattr(settings, "groq_api_key", None)
    if groq_key:
        return groq_key
    
    return ""


def get_gemini_api_key() -> str:
    """
    Get a Gemini API key, rotating through multiple keys if available.
    Set GEMINI_API_KEYS as comma-separated list for rotation, or use single key.
    """
    global _gemini_key_index
    
    # Check for multiple keys (comma-separated)
    multi_keys = getattr(settings, "gemini_api_keys", "")
    if multi_keys:
        keys = [k.strip() for k in multi_keys.split(",") if k.strip()]
        if keys:
            # Round-robin rotation
            key = keys[_gemini_key_index % len(keys)]
            _gemini_key_index += 1
            return key
    
    # Fall back to single key
    gemini_key = getattr(settings, "gemini_api_key", None)
    if gemini_key:
        return gemini_key
    
    # Final fallback to ai_service_api_key
    return settings.ai_service_api_key or ""


async def call_groq_api(prompt: str, model: str = "llama-3.3-70b-versatile", max_tokens: int = 4096, temperature: float = 0.2) -> Dict[str, Any]:
    """
    Call Groq API with the given prompt. Uses OpenAI-compatible API format.
    Supports key rotation for rate limit mitigation.
    
    Available models:
    - llama-3.3-70b-versatile (recommended - best quality)
    - llama-3.1-8b-instant (faster, lower quality)
    - mixtral-8x7b-32768 (good for long context)
    """
    api_key = get_groq_api_key()
    if not api_key:
        raise Exception("GROQ_API_KEYS environment variable is required. Please set it in Railway.")
    
    base_url = getattr(settings, "groq_api_url", "https://api.groq.com/openai/v1").rstrip('/')
    endpoint = f"{base_url}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    
    last_exc: Exception = Exception("Unknown error during Groq API call")
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(endpoint, json=body, headers=headers)
                
                if resp.status_code == 429:
                    wait_time = min(30, 5 * (attempt + 1))
                    logger.warning(f"Groq rate limited (429). Waiting {wait_time}s before retry {attempt+1}")
                    last_exc = Exception(f"Groq rate limited after {attempt+1} attempts")
                    await asyncio.sleep(wait_time)
                    # Try with a different key on next attempt
                    api_key = get_groq_api_key()
                    headers["Authorization"] = f"Bearer {api_key}"
                    continue
                
                if resp.status_code >= 400:
                    error_body = resp.text
                    logger.error(f"Groq API error {resp.status_code}: {error_body}")
                    last_exc = Exception(f"Groq API error {resp.status_code}: {error_body}")
                    
                resp.raise_for_status()
                data = resp.json()
                
                # Extract content from OpenAI-compatible response
                text_output = ""
                if "choices" in data and len(data["choices"]) > 0:
                    text_output = data["choices"][0].get("message", {}).get("content", "")
                
                return {"text": text_output, "raw": data}
                
        except httpx.HTTPStatusError as e:
            last_exc = e
            logger.warning(f"Groq API attempt {attempt+1} failed: {e}")
            await asyncio.sleep(2 ** attempt)
        except Exception as e:
            last_exc = e if isinstance(e, Exception) else Exception(str(e))
            logger.warning(f"Groq API attempt {attempt+1} failed: {e}")
            await asyncio.sleep(2 ** attempt)
    
    raise last_exc


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
    Call Groq API to produce a structured ATS report.
    Uses Groq as primary provider with key rotation for rate limit mitigation.
    """
    clipped_resume_text = _clip_text(resume_text, _MAX_ATS_RESUME_CHARS)

    prompt = (
        "You are an expert applicant-tracking-system (ATS) evaluator. "
        "Given the candidate resume text, return a strict JSON object with the following keys:\n"
        "- score: integer 0-100 representing ATS fit for the role\n"
        "- summary: short plain-text summary (1-3 sentences)\n"
        "- issues: list of strings describing missing keywords, formatting, or problems\n"
        "- recommendations: list of actionable suggestions to improve ATS compatibility\n"
        "Respond with JSON only and nothing else. If a value is missing, return null or an empty list.\n\n"
        f"Resume:\n{clipped_resume_text}\n\nJSON:\n"
    )

    # Use Groq as primary provider
    groq_key = get_groq_api_key()
    if groq_key:
        try:
            result = await call_groq_api(prompt, model="llama-3.3-70b-versatile", max_tokens=max_output_tokens, temperature=0.0)
            text_output = result.get("text", "")
            
            # Parse JSON from response
            try:
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
                    parsed = {"score": None, "summary": text_output, "issues": [], "recommendations": []}
            
            return {
                "score": parsed.get("score"),
                "summary": parsed.get("summary"),
                "issues": parsed.get("issues") or [],
                "recommendations": parsed.get("recommendations") or [],
                "raw": result.get("raw"),
            }
        except Exception as e:
            logger.error(f"Groq API failed for ATS report: {e}")
            heuristic = _heuristic_ats_report_enhanced(clipped_resume_text, "")
            return {
                "score": heuristic.get("score"),
                "summary": heuristic.get("summary"),
                "issues": heuristic.get("formatting_issues") or [],
                "recommendations": heuristic.get("improvements") or [],
                "raw": {"provider": "heuristic_fallback", "reason": str(e)},
            }
    
    raise Exception("GROQ_API_KEYS environment variable is required for ATS analysis. Please set it in Railway.")


async def generate_questions(job_description: str, max_questions: int = 10, model: str | None = None) -> Dict[str, Any]:
    """
    Generate a list of TECHNICAL interview questions given a job description.
    Uses Groq as primary provider with key rotation for rate limit mitigation.
    Returns: { "questions": ["q1", "q2", ...], "raw": <provider response> }
    """
    prompt = f"""You are a senior professional interviewer preparing interview questions for a real job interview. You are NOT a quiz maker — you are a hiring manager crafting questions that test real competence.

JOB DESCRIPTION/ROLE:
{job_description}

Generate EXACTLY {max_questions} interview questions that a senior interviewer would ask in a real interview for this role.

QUESTION QUALITY RULES:
1. Questions must sound like a REAL interviewer asking them — conversational, professional, and specific
2. Each question must be directly relevant to the job description/role above
3. Questions should test practical knowledge and real-world experience, not textbook knowledge
4. Use scenarios and situations, not definitions or lists

REQUIRED QUESTION DISTRIBUTION (for {max_questions} questions):
- 2 CONCEPTUAL questions: Test understanding of core concepts relevant to the role
  Example: "How would you explain the difference between horizontal and vertical scaling to a non-technical stakeholder?"
  NOT: "Define horizontal scaling."

- 3 SCENARIO-BASED questions: Present realistic work situations
  Example: "If a service you own started throwing 500 errors during peak traffic, walk me through your debugging approach."
  NOT: "What is a 500 error?"

- 2 SYSTEM DESIGN / ARCHITECTURE questions: Test ability to design solutions
  Example: "How would you design a notification system that needs to handle millions of messages per day?"
  NOT: "List the components of a notification system."

- 2 EXPERIENCE-BASED questions: Draw on past work experience
  Example: "Tell me about a time you had to refactor a critical piece of infrastructure. What was your approach?"
  NOT: "What is refactoring?"

- 1 BEHAVIORAL / CULTURAL FIT question: Assess soft skills and team dynamics
  Example: "Describe a situation where you disagreed with a technical decision. How did you handle it?"
  NOT: "Are you a team player?"

ANTI-HALLUCINATION RULES:
- Only reference REAL technologies, frameworks, tools, and methodologies that actually exist
- Do not invent fake libraries, protocols, or technical concepts
- Ground questions in the actual technologies and skills mentioned in the job description

PROFESSIONAL TONE:
- Questions should feel like they're coming from a knowledgeable interviewer, not a textbook
- Use "walk me through", "tell me about", "how would you", "describe" — not "define", "list", "what is"
- Each question should invite a detailed, thoughtful response

Return a JSON object with ONLY a "questions" key containing an array of {max_questions} question strings.
Example format: {{"questions": ["If you inherited a legacy codebase with no tests, how would you approach adding test coverage without disrupting active development?", "Walk me through how you would design a rate limiting system for a public API", ...]}}

Return JSON only, no markdown, no explanation."""

    # Use Groq as primary provider
    groq_key = get_groq_api_key()
    if groq_key:
        try:
            result = await call_groq_api(prompt, model="llama-3.3-70b-versatile", max_tokens=2048, temperature=0.2)
            text_output = result.get("text", "")
            
            # Parse JSON from response
            try:
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
                
                # Ensure questions is a list of strings
                if questions and isinstance(questions, list):
                    if len(questions) > 0 and isinstance(questions[0], dict):
                        questions = [q.get("text") or q.get("question") or str(q) for q in questions]
                    questions = [q for q in questions if isinstance(q, str) and len(q) > 10]
                
                logger.info(f"Extracted {len(questions)} questions from Groq response")
                
            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error for questions: {e}. Text: {text_output[:500]}")
                questions = [q.strip() for q in text_output.splitlines() if q.strip() and len(q.strip()) > 20][:max_questions]
            except Exception as e:
                logger.error(f"Error parsing questions: {e}")
                questions = [q.strip() for q in text_output.splitlines() if q.strip() and len(q.strip()) > 20][:max_questions]
            
            return {"questions": questions[:max_questions], "raw": result.get("raw")}
            
        except Exception as e:
            logger.error(f"Groq API failed for questions: {e}")
            raise
    
    raise Exception("GROQ_API_KEYS environment variable is required for question generation. Please set it in Railway.")


async def generate_ats_report_enhanced(resume_text: str, job_description: str = "", model: str | None = None) -> Dict[str, Any]:
    """
    Enhanced ATS report with detailed section-by-section analysis.
    Uses Groq as primary provider with key rotation for rate limit mitigation.
    Used for candidate-facing ATS checker tool.
    """
    clipped_resume_text = _clip_text(resume_text, _MAX_ATS_RESUME_CHARS)
    clipped_job_description = _clip_text(job_description, _MAX_ATS_JOB_DESC_CHARS)
    if len((resume_text or "").strip()) > len(clipped_resume_text):
        logger.warning("ATS input resume text clipped from %s to %s chars", len((resume_text or "").strip()), len(clipped_resume_text))
    if len((job_description or "").strip()) > len(clipped_job_description):
        logger.warning("ATS input job description clipped from %s to %s chars", len((job_description or "").strip()), len(clipped_job_description))

    jd_context = ""
    if clipped_job_description:
        jd_context = f"\n\nTARGET JOB DESCRIPTION/ROLE:\n{clipped_job_description}\n\nAnalyze the resume specifically for this role. Check if the candidate's skills and experience align with this position."

    prompt = f"""You are an expert ATS (Applicant Tracking System) analyst. Analyze this resume and provide a detailed assessment.

RESUME:
{clipped_resume_text}
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

    # Use Groq as primary provider
    groq_key = get_groq_api_key()
    if groq_key:
        try:
            result = await call_groq_api(prompt, model="llama-3.3-70b-versatile", max_tokens=1800, temperature=0.2)
            text_output = result.get("text", "")
            
            # Parse JSON from response
            try:
                clean_text = text_output.strip()
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:]
                if clean_text.startswith("```"):
                    clean_text = clean_text[3:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]
                clean_text = clean_text.strip()
                
                # Fix common JSON issues
                import re
                clean_text = re.sub(r',\s*}', '}', clean_text)
                clean_text = re.sub(r',\s*]', ']', clean_text)
                
                parsed = json.loads(clean_text)
                
            except (json.JSONDecodeError, ValueError) as json_err:
                logger.warning(f"JSON decode error: {json_err}. Attempting to salvage partial data...")
                import re
                
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
                        return items[:10]
                    return []
                
                parsed["highlights"] = extract_array("highlights") or ["Resume analyzed"]
                parsed["improvements"] = extract_array("improvements") or ["Continue improving your resume"]
                parsed["keywords_found"] = extract_array("keywords_found")
                parsed["keywords_missing"] = extract_array("keywords_missing")
                parsed["formatting_issues"] = extract_array("formatting_issues")
                parsed["action_verbs_used"] = extract_array("action_verbs_used")
                
                # Set defaults for anything still missing
                if "score" not in parsed:
                    parsed["score"] = 65
                if "summary" not in parsed:
                    parsed["summary"] = "Resume analysis completed with partial results."
            
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
            
        except Exception as e:
            logger.error(f"Groq API failed for enhanced ATS report: {e}")
            fallback = _heuristic_ats_report_enhanced(clipped_resume_text, clipped_job_description)
            fallback["summary"] = f"{fallback.get('summary', '')} (Fallback analysis used because AI provider was unavailable.)".strip()
            return fallback
    
    raise Exception("GROQ_API_KEYS environment variable is required for ATS analysis. Please set it in Railway.")


async def extract_candidate_profile_from_resume(
    resume_text: str,
    hinted_position: str = "",
    hinted_domain: str = "",
    model: str | None = None,
) -> Dict[str, Any]:
    """
    Extract candidate registration fields from resume text.
    Returns a normalized object suitable for candidate creation flows.
    """
    text = (resume_text or "").strip()
    if not text:
        raise Exception("Resume text is empty; cannot extract profile.")

    prompt = f"""You are an expert resume parser.
Extract candidate profile data and return ONLY valid JSON with these fields:
{{
  "full_name": "<candidate full name>",
  "email": "<email>",
  "phone": "<phone>",
  "position": "<most relevant role title>",
  "domain": "<functional domain>",
  "experience_years": <integer or null>,
  "qualifications": "<short summary of education, certifications, and key skills>"
}}

Rules:
- If email is missing, return an empty string for email.
- Use null for unknown experience_years.
- Keep qualifications concise (<= 300 chars).
- Do not include markdown.

Hints:
- Position override: {hinted_position or "none"}
- Domain override: {hinted_domain or "none"}

Resume text:
{text[:12000]}
"""

    parsed: Dict[str, Any] = {}
    groq_key = get_groq_api_key()
    if groq_key:
        try:
            result = await call_groq_api(
                prompt,
                model=model or "llama-3.3-70b-versatile",
                max_tokens=1200,
                temperature=0.0,
            )
            raw_text = str(result.get("text", "")).strip()
            if raw_text:
                cleaned = raw_text
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                if cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
                try:
                    parsed = json.loads(cleaned)
                except Exception:
                    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
                    if match:
                        parsed = json.loads(match.group(0))
        except Exception as e:
            logger.warning("LLM profile extraction failed; using heuristic fallback: %s", e)

    # Heuristic fallback (or post-processor for partial model output).
    if not isinstance(parsed, dict):
        parsed = {}

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    email_match = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", text)
    phone_match = re.search(r"(\+?\d[\d\-\s().]{8,}\d)", text)
    years_match = re.search(r"(\d{1,2})\s*\+?\s*(?:years|yrs)\b", text, re.IGNORECASE)

    guessed_name = ""
    for line in lines[:8]:
        if "@" in line or len(line) > 60:
            continue
        if re.search(r"[A-Za-z]", line):
            guessed_name = line
            break

    guessed_position = ""
    role_patterns = [
        r"(devops engineer|site reliability engineer|sre|software engineer|backend engineer|frontend engineer|full stack engineer|data engineer|ml engineer|product manager|qa engineer|cloud engineer|platform engineer)",
    ]
    for pattern in role_patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            guessed_position = m.group(1)
            break

    position_value = (hinted_position or parsed.get("position") or guessed_position or "").strip()
    domain_value = (hinted_domain or parsed.get("domain") or "").strip()
    if not domain_value and position_value:
        lower_position = position_value.lower()
        if "devops" in lower_position or "sre" in lower_position:
            domain_value = "DevOps"
        elif "data" in lower_position or "ml" in lower_position:
            domain_value = "Data"
        elif "product" in lower_position:
            domain_value = "Product"
        elif "qa" in lower_position or "test" in lower_position:
            domain_value = "QA"
        else:
            domain_value = "Engineering"

    raw_experience = parsed.get("experience_years")
    experience_years = None
    try:
        if raw_experience is not None and str(raw_experience).strip() != "":
            experience_years = max(0, min(80, int(float(raw_experience))))
    except Exception:
        experience_years = None
    if experience_years is None and years_match:
        try:
            experience_years = max(0, min(80, int(years_match.group(1))))
        except Exception:
            experience_years = None

    qualifications = str(parsed.get("qualifications") or "").strip()
    if not qualifications:
        qualifications = "Parsed from resume."

    return {
        "full_name": str(parsed.get("full_name") or guessed_name).strip(),
        "email": str(parsed.get("email") or (email_match.group(0) if email_match else "")).strip().lower(),
        "phone": str(parsed.get("phone") or (phone_match.group(1) if phone_match else "")).strip(),
        "position": position_value,
        "domain": domain_value,
        "experience_years": experience_years,
        "qualifications": qualifications[:300],
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
    Uses Groq as primary provider with key rotation for rate limit mitigation.
    Analyzes behavior, confidence, answer quality, and provides hiring recommendation.
    """
    def extract_qa_pairs(transcript_items: list) -> List[Dict[str, Any]]:
        """Convert transcript timeline into ordered question/answer pairs."""
        qa_pairs: List[Dict[str, Any]] = []
        current_question: str | None = None
        current_question_timestamp: str | None = None

        for item in transcript_items:
            role = str(item.get("role", "")).lower()
            content = str(item.get("content", "")).strip()
            if not content:
                continue

            if role in {"ai", "assistant", "interviewer"}:
                current_question = content
                current_question_timestamp = item.get("timestamp")
                continue

            if role in {"user", "candidate"} and current_question:
                qa_pairs.append(
                    {
                        "question": current_question,
                        "answer": content,
                        "question_timestamp": current_question_timestamp,
                        "answer_timestamp": item.get("timestamp"),
                    }
                )
                current_question = None
                current_question_timestamp = None

        return qa_pairs

    def _score_answer_text(answer: str) -> int:
        """Deterministic score used to fill missing per-question evaluation."""
        if not answer:
            return 20
        answer_l = answer.lower()
        uncertain = ("don't know", "not sure", "no idea", "can't recall", "skip")
        uncertain_hits = sum(1 for token in uncertain if token in answer_l)
        length_factor = min(len(answer) / 4.0, 55)
        score = int(35 + length_factor - (uncertain_hits * 15))
        return max(15, min(95, score))

    def _score_to_rating(score: int) -> str:
        if score >= 85:
            return "EXCELLENT"
        if score >= 70:
            return "GOOD"
        if score >= 50:
            return "FAIR"
        return "POOR"

    def normalize_qa_evaluations(
        qa_pairs: List[Dict[str, Any]],
        parsed_evaluations: object,
        parsed_key_answers: object,
    ) -> List[Dict[str, Any]]:
        """
        Ensure every transcript Q&A has an AI opinion row.
        Falls back deterministically when model response is partial/malformed.
        """
        evaluations_by_question: Dict[str, Dict[str, Any]] = {}

        if isinstance(parsed_evaluations, list):
            for item in parsed_evaluations:
                if not isinstance(item, dict):
                    continue
                question = str(item.get("question", "")).strip()
                if not question:
                    continue
                score = item.get("score")
                try:
                    score_value = int(score) if score is not None else None
                except Exception:
                    score_value = None
                if score_value is None:
                    score_value = _score_answer_text(str(item.get("answer", "")).strip())
                score_value = max(0, min(100, score_value))
                rating = str(item.get("rating", "")).strip().upper() or _score_to_rating(score_value)
                evaluations_by_question[question.lower()] = {
                    "question": question,
                    "answer": str(item.get("answer", "")).strip(),
                    "rating": rating,
                    "score": score_value,
                    "opinion": str(item.get("opinion", "")).strip(),
                    "improvement": str(item.get("improvement", "")).strip(),
                }

        # Backfill from key_answers if qa_evaluations was not provided by the model.
        if isinstance(parsed_key_answers, list):
            for item in parsed_key_answers:
                if not isinstance(item, dict):
                    continue
                question = str(item.get("question", "")).strip()
                if not question:
                    continue
                key = question.lower()
                if key in evaluations_by_question:
                    continue
                rating = str(item.get("rating", "FAIR")).strip().upper() or "FAIR"
                base_score = {"EXCELLENT": 90, "GOOD": 75, "FAIR": 58, "POOR": 35}.get(rating, 58)
                evaluations_by_question[key] = {
                    "question": question,
                    "answer": "",
                    "rating": rating,
                    "score": base_score,
                    "opinion": str(item.get("answer_summary", "")).strip(),
                    "improvement": "",
                }

        normalized: List[Dict[str, Any]] = []
        for pair in qa_pairs:
            question = str(pair.get("question", "")).strip()
            answer = str(pair.get("answer", "")).strip()
            eval_item = evaluations_by_question.get(question.lower(), {})

            score_value = eval_item.get("score")
            if score_value is None:
                score_value = _score_answer_text(answer)
            score_value = max(0, min(100, int(score_value)))

            rating = str(eval_item.get("rating", "")).strip().upper()
            if rating not in {"EXCELLENT", "GOOD", "FAIR", "POOR"}:
                rating = _score_to_rating(score_value)

            opinion = str(eval_item.get("opinion", "")).strip()
            generated_feedback = _build_contextual_qa_feedback(question, answer, score_value)
            if _is_generic_qa_feedback(opinion, kind="opinion"):
                opinion = generated_feedback["opinion"]

            improvement = str(eval_item.get("improvement", "")).strip()
            if _is_generic_qa_feedback(improvement, kind="improvement"):
                improvement = generated_feedback["improvement"]

            normalized.append(
                {
                    "question": question,
                    "answer": answer,
                    "rating": rating,
                    "score": score_value,
                    "opinion": opinion,
                    "improvement": improvement,
                    "question_timestamp": pair.get("question_timestamp"),
                    "answer_timestamp": pair.get("answer_timestamp"),
                }
            )

        return normalized

    def safe_int(value: object, default: int) -> int:
        try:
            return int(value)  # type: ignore[arg-type]
        except Exception:
            return default

    qa_pairs = extract_qa_pairs(transcript)

    # Format transcript for AI and extract visual feedback
    transcript_text_lines = []
    visual_feedback_highlights = []
    
    for msg in transcript:
        role = str(msg.get('role', 'unknown')).upper()
        content = msg.get('content', '')
        transcript_text_lines.append(f"[{role}]: {content}")
        
        # Check for visual_feedback in meta.flags
        meta = msg.get('meta') or {}
        flags = meta.get('flags') or []
        for flag in flags:
            if isinstance(flag, str) and flag.startswith('visual_feedback:'):
                feedback = flag.split(':', 1)[1]
                visual_feedback_highlights.append(feedback)
    
    transcript_text = "\n".join(transcript_text_lines)
    
    visual_obs_context = ""
    if visual_feedback_highlights:
        # De-duplicate feedback
        unique_highlights = list(set(visual_feedback_highlights))
        visual_obs_context = "\nVISUAL OBSERVATIONS & SYSTEM ALERTS:\n"
        for obs in unique_highlights:
            visual_obs_context += f"- {obs}\n"
        visual_obs_context += "IMPORTANT: If multiple people were detected, this is a critical integrity issue. Adjust overall_score and recommendation accordingly.\n"

    def fallback_verdict(reason: str) -> Dict[str, Any]:
        """Deterministic fallback so verdict generation never blocks interview completion."""
        user_answers = [
            (msg.get("content") or "").strip()
            for msg in transcript
            if str(msg.get("role", "")).lower() == "user"
        ]
        answer_count = len(user_answers)
        non_empty_answers = [a for a in user_answers if a]
        avg_len = (
            sum(len(answer) for answer in non_empty_answers) / max(len(non_empty_answers), 1)
            if non_empty_answers
            else 0
        )
        uncertain_phrases = ("don't know", "not sure", "no idea", "can't recall", "skip")
        uncertainty_count = sum(
            1
            for answer in non_empty_answers
            if any(phrase in answer.lower() for phrase in uncertain_phrases)
        )
        uncertainty_ratio = uncertainty_count / max(len(non_empty_answers), 1)

        # Heuristic scoring tuned to remain conservative under uncertainty.
        answer_score = max(25, min(92, int(40 + min(avg_len / 2.5, 35) - (uncertainty_ratio * 20))))
        confidence_score = max(20, min(90, int(35 + min(avg_len / 4, 30) - (uncertainty_ratio * 25))))
        behavior_score = max(
            30,
            min(92, int(45 + min(answer_count * 4, 20) + (5 if uncertainty_ratio < 0.2 else 0))),
        )

        overall_score = int(
            round((answer_score * 0.45) + (confidence_score * 0.25) + (behavior_score * 0.30))
        )
        if ats_score is not None:
            # Blend ATS lightly; interview performance still dominates.
            overall_score = int(round((overall_score * 0.8) + (max(0, min(100, ats_score)) * 0.2)))

        if overall_score >= 70 and answer_score >= 65:
            recommendation = "HIRE"
            hiring_risk = "LOW"
        elif overall_score < 45 or answer_score < 40:
            recommendation = "REJECT"
            hiring_risk = "HIGH"
        else:
            recommendation = "NEUTRAL"
            hiring_risk = "MEDIUM"

        summary = (
            f"Fallback evaluation generated because AI verdict provider was unavailable ({reason}). "
            f"Candidate provided {answer_count} responses with average answer length of {int(avg_len)} characters."
        )
        if position:
            summary += f" Interview context: {position}."

        strengths: List[str] = []
        weaknesses: List[str] = []
        if answer_score >= 65:
            strengths.append("Responses were generally detailed and substantive.")
        if confidence_score >= 60:
            strengths.append("Candidate showed stable confidence in responses.")
        if behavior_score >= 60:
            strengths.append("Interview participation and engagement were consistent.")

        if uncertainty_ratio >= 0.3:
            weaknesses.append("Multiple uncertain responses detected; deeper probing recommended.")
        if avg_len < 60:
            weaknesses.append("Several answers were brief and may lack depth.")
        if not strengths:
            strengths.append("Candidate completed the interview flow without interruption.")
        if not weaknesses:
            weaknesses.append("Conduct a quick human review for final calibration.")

        qa_evaluations = normalize_qa_evaluations(qa_pairs, [], [])
        key_answers = [
            {
                "question": item["question"],
                "answer_summary": item["opinion"],
                "rating": item["rating"],
            }
            for item in qa_evaluations[:5]
        ]

        return {
            "recommendation": recommendation,
            "behavior_score": behavior_score,
            "confidence_score": confidence_score,
            "answer_score": answer_score,
            "overall_score": overall_score,
            "summary": summary,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "detailed_feedback": "Automated fallback scoring was used due to provider unavailability. Recommend human review before final decision.",
            "technical_assessment": "Fallback mode: limited to transcript-structure signals.",
            "hiring_risk": hiring_risk,
            "key_answers": key_answers,
            "qa_evaluations": qa_evaluations,
            "total_questions": len(qa_pairs),
            "total_answers": len(qa_pairs),
            "raw": {
                "fallback": True,
                "reason": reason,
                "answer_count": answer_count,
                "avg_answer_length": int(avg_len),
                "uncertainty_ratio": round(uncertainty_ratio, 3),
            },
        }
    
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
{visual_obs_context}
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
    ],
    "qa_evaluations": [
        {{
            "question": "<exact asked question>",
            "answer": "<candidate answer excerpt>",
            "rating": "EXCELLENT" | "GOOD" | "FAIR" | "POOR",
            "score": <integer 0-100>,
            "opinion": "<2-3 line evaluator opinion specific to the given answer>",
            "improvement": "<one actionable way to improve this answer>"
        }}
    ],
    "total_questions": <integer>,
    "total_answers": <integer>
}}

RECOMMENDATION RULES:
- **HIRE**: overall_score >= 70 AND answer_score >= 65 AND no major red flags
- **REJECT**: overall_score < 45 OR answer_score < 40 OR critical red flags (dishonesty, unprofessionalism, lack of basic knowledge)
- **NEUTRAL**: All other cases requiring human review

Be thorough and specific. Base your evaluation on actual transcript content, not assumptions.
Return ONLY valid JSON, no markdown, no explanation."""

    # Use Groq as primary provider
    groq_key = get_groq_api_key()
    if groq_key:
        try:
            result = await call_groq_api(prompt, model="llama-3.3-70b-versatile", max_tokens=4096, temperature=0.2)
            text_output = result.get("text", "")
            
            # Parse JSON from response
            try:
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
                "qa_evaluations": normalize_qa_evaluations(
                    qa_pairs,
                    parsed.get("qa_evaluations"),
                    parsed.get("key_answers"),
                ),
                "total_questions": safe_int(parsed.get("total_questions"), len(qa_pairs)),
                "total_answers": safe_int(parsed.get("total_answers"), len(qa_pairs)),
                "raw": result.get("raw")
            }
            
        except Exception as e:
            logger.error(f"Groq API failed for interview verdict: {e}")
            return fallback_verdict(str(e))
    
    logger.warning("GROQ_API_KEYS is not configured; using fallback interview verdict scoring.")
    return fallback_verdict("missing_groq_api_key")
