"""
Resume Contradiction Analyzer

Analyzes candidate responses against their resume to detect:
- Timeline inconsistencies
- Skill/technology mismatches
- Experience level discrepancies
- Role responsibility contradictions
"""
import json
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
import spacy

from .config import settings

logger = logging.getLogger(__name__)


@dataclass
class ContradictionResult:
    """Result of contradiction analysis"""
    has_contradiction: bool
    confidence: float  # 0.0 - 1.0
    contradiction_type: Optional[str] = None  # timeline, skill, experience, role
    description: Optional[str] = None
    resume_claim: Optional[str] = None
    spoken_claim: Optional[str] = None
    severity: str = "low"  # low, medium, high
    followup_questions: List[str] = field(default_factory=list)


@dataclass
class SkillAnalysisResult:
    """Result of skill analysis"""
    claimed_skill: str
    demonstrated_level: str  # none, basic, intermediate, advanced, expert
    expected_level: str  # from resume
    is_consistent: bool
    confidence: float
    evidence: List[str] = field(default_factory=list)


class ResumeContradictionAnalyzer:
    """
    Analyzes interview responses for contradictions with resume claims.
    Uses LLM for semantic understanding with structured output.
    """
    
    def __init__(self, openai_client=None, anthropic_client=None):
        self.openai_client = openai_client
        self.anthropic_client = anthropic_client
        
        # Load spacy for NLP preprocessing
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("Spacy model not found, using basic processing")
            self.nlp = None
        
        # Contradiction prompt template
        self.contradiction_prompt = """You are an expert interview analyst. Analyze the candidate's spoken response for any contradictions with their resume.

RESUME DATA:
{resume_json}

RECENT TRANSCRIPT (what the candidate said):
{transcript}

CONTEXT: The candidate is interviewing for: {job_title}

Analyze for these types of contradictions:
1. TIMELINE: Dates, durations, employment gaps that don't match
2. SKILL: Claiming expertise they don't demonstrate or denying skills they listed
3. EXPERIENCE: Years of experience, project scope, team size mismatches
4. ROLE: Job responsibilities that don't align with what they describe

Respond in this exact JSON format:
{{
    "has_contradiction": true/false,
    "confidence": 0.0-1.0,
    "contradiction_type": "timeline|skill|experience|role|null",
    "description": "Brief description of the contradiction or null",
    "resume_claim": "What the resume says",
    "spoken_claim": "What the candidate said",
    "severity": "low|medium|high",
    "followup_questions": ["Question 1", "Question 2"]
}}

Important:
- Only flag contradictions with HIGH confidence (>0.8)
- Be conservative - don't flag vague or ambiguous statements
- Consider that candidates may simplify or generalize when speaking
- Minor discrepancies (off by a few months) should be LOW severity
- Follow-up questions should be non-confrontational

Respond with ONLY the JSON, no other text."""

        self.skill_verification_prompt = """You are a technical interviewer. Analyze if the candidate's spoken responses demonstrate the skill level they claim on their resume.

CLAIMED SKILL FROM RESUME:
Skill: {skill_name}
Claimed Level: {claimed_level}
Context: {skill_context}

CANDIDATE'S RESPONSES ABOUT THIS SKILL:
{responses}

Evaluate the demonstration level based on:
- Technical accuracy of explanations
- Depth of understanding shown
- Practical examples given
- Problem-solving approach

Respond in this exact JSON format:
{{
    "claimed_skill": "{skill_name}",
    "demonstrated_level": "none|basic|intermediate|advanced|expert",
    "expected_level": "{claimed_level}",
    "is_consistent": true/false,
    "confidence": 0.0-1.0,
    "evidence": ["Evidence 1", "Evidence 2"]
}}

Be fair - nervousness can affect articulation. Only flag clear skill gaps.
Respond with ONLY the JSON, no other text."""

        self.question_generation_prompt = """You are an experienced technical interviewer. Based on the resume and conversation so far, generate relevant follow-up questions.

RESUME DATA:
{resume_json}

CONVERSATION SO FAR:
{transcript}

JOB ROLE: {job_title}

AREAS TO PROBE (based on potential gaps identified):
{gap_areas}

Generate {num_questions} follow-up questions that:
1. Clarify any ambiguous statements
2. Dig deeper into claimed expertise
3. Verify specific achievements mentioned
4. Are professional and non-confrontational

Respond in this exact JSON format:
{{
    "questions": [
        {{
            "question": "The question text",
            "purpose": "What this question aims to verify",
            "skill_area": "The skill or experience being probed"
        }}
    ]
}}

Respond with ONLY the JSON, no other text."""

    async def analyze_contradiction(
        self,
        resume_data: Dict[str, Any],
        transcript: str,
        job_title: str = "Software Engineer"
    ) -> ContradictionResult:
        """
        Analyze transcript for contradictions with resume.
        
        Args:
            resume_data: Parsed resume JSON
            transcript: Recent interview transcript
            job_title: Position being interviewed for
            
        Returns:
            ContradictionResult with analysis
        """
        try:
            # Prepare the prompt
            prompt = self.contradiction_prompt.format(
                resume_json=json.dumps(resume_data, indent=2),
                transcript=transcript,
                job_title=job_title
            )
            
            # Call LLM
            response = await self._call_llm(prompt)
            
            # Parse response
            result = json.loads(response)
            
            # Only return if confidence meets threshold
            if result.get("confidence", 0) < settings.contradiction_confidence_threshold:
                return ContradictionResult(
                    has_contradiction=False,
                    confidence=result.get("confidence", 0)
                )
            
            return ContradictionResult(
                has_contradiction=result.get("has_contradiction", False),
                confidence=result.get("confidence", 0),
                contradiction_type=result.get("contradiction_type"),
                description=result.get("description"),
                resume_claim=result.get("resume_claim"),
                spoken_claim=result.get("spoken_claim"),
                severity=result.get("severity", "low"),
                followup_questions=result.get("followup_questions", [])
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}")
            return ContradictionResult(has_contradiction=False, confidence=0)
        except Exception as e:
            logger.error(f"Contradiction analysis failed: {e}")
            return ContradictionResult(has_contradiction=False, confidence=0)

    async def verify_skill(
        self,
        skill_name: str,
        claimed_level: str,
        skill_context: str,
        responses: List[str]
    ) -> SkillAnalysisResult:
        """
        Verify if candidate demonstrates claimed skill level.
        
        Args:
            skill_name: The skill being verified
            claimed_level: Level claimed on resume
            skill_context: How skill appears on resume
            responses: Candidate's responses about this skill
            
        Returns:
            SkillAnalysisResult with verification
        """
        try:
            prompt = self.skill_verification_prompt.format(
                skill_name=skill_name,
                claimed_level=claimed_level,
                skill_context=skill_context,
                responses="\n".join(responses)
            )
            
            response = await self._call_llm(prompt)
            result = json.loads(response)
            
            return SkillAnalysisResult(
                claimed_skill=result.get("claimed_skill", skill_name),
                demonstrated_level=result.get("demonstrated_level", "unknown"),
                expected_level=result.get("expected_level", claimed_level),
                is_consistent=result.get("is_consistent", True),
                confidence=result.get("confidence", 0),
                evidence=result.get("evidence", [])
            )
            
        except Exception as e:
            logger.error(f"Skill verification failed: {e}")
            return SkillAnalysisResult(
                claimed_skill=skill_name,
                demonstrated_level="unknown",
                expected_level=claimed_level,
                is_consistent=True,
                confidence=0
            )

    async def generate_followup_questions(
        self,
        resume_data: Dict[str, Any],
        transcript: str,
        job_title: str,
        gap_areas: List[str] = None,
        num_questions: int = 3
    ) -> List[Dict[str, str]]:
        """
        Generate intelligent follow-up questions based on interview progress.
        
        Args:
            resume_data: Parsed resume JSON
            transcript: Interview transcript so far
            job_title: Position being interviewed for
            gap_areas: Specific areas to probe
            num_questions: Number of questions to generate
            
        Returns:
            List of question dictionaries
        """
        try:
            prompt = self.question_generation_prompt.format(
                resume_json=json.dumps(resume_data, indent=2),
                transcript=transcript,
                job_title=job_title,
                gap_areas=", ".join(gap_areas) if gap_areas else "General verification",
                num_questions=min(num_questions, settings.max_followup_questions)
            )
            
            response = await self._call_llm(prompt)
            result = json.loads(response)
            
            return result.get("questions", [])
            
        except Exception as e:
            logger.error(f"Question generation failed: {e}")
            return []

    async def extract_key_claims(self, transcript: str) -> List[Dict[str, Any]]:
        """
        Extract verifiable claims from transcript using NLP.
        
        Args:
            transcript: The interview transcript
            
        Returns:
            List of claims with type and content
        """
        claims = []
        
        if self.nlp:
            doc = self.nlp(transcript)
            
            # Extract named entities that might be claims
            for ent in doc.ents:
                if ent.label_ in ["DATE", "TIME", "CARDINAL", "ORG", "PRODUCT"]:
                    claims.append({
                        "type": ent.label_,
                        "text": ent.text,
                        "context": transcript[max(0, ent.start_char-50):min(len(transcript), ent.end_char+50)]
                    })
            
            # Look for experience patterns
            experience_patterns = [
                "years of experience",
                "worked on",
                "led a team",
                "managed",
                "developed",
                "built"
            ]
            
            text_lower = transcript.lower()
            for pattern in experience_patterns:
                if pattern in text_lower:
                    idx = text_lower.find(pattern)
                    claims.append({
                        "type": "experience_claim",
                        "text": pattern,
                        "context": transcript[max(0, idx-30):min(len(transcript), idx+60)]
                    })
        
        return claims

    async def _call_llm(self, prompt: str) -> str:
        """
        Call the configured LLM with the prompt.
        
        Args:
            prompt: The prompt to send
            
        Returns:
            LLM response text
        """
        try:
            if settings.default_llm == "openai" and self.openai_client:
                response = await self.openai_client.chat.completions.create(
                    model=settings.openai_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,  # Lower for more consistent analysis
                    max_tokens=1000
                )
                return response.choices[0].message.content
                
            elif settings.default_llm == "anthropic" and self.anthropic_client:
                response = await self.anthropic_client.messages.create(
                    model=settings.anthropic_model,
                    max_tokens=1000,
                    messages=[{"role": "user", "content": prompt}]
                )
                return response.content[0].text
                
            else:
                # Fallback to OpenAI if available
                if self.openai_client:
                    response = await self.openai_client.chat.completions.create(
                        model=settings.openai_model,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.3,
                        max_tokens=1000
                    )
                    return response.choices[0].message.content
                    
                raise ValueError("No LLM client configured")
                
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            raise


class TranscriptAnalyzer:
    """
    Analyzes interview transcript in real-time for insights.
    """
    
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            self.nlp = None
    
    def analyze_response_quality(self, response: str) -> Dict[str, Any]:
        """
        Analyze the quality of a candidate's response.
        
        Args:
            response: The candidate's response text
            
        Returns:
            Quality metrics
        """
        metrics = {
            "word_count": 0,
            "sentence_count": 0,
            "avg_sentence_length": 0,
            "has_specific_examples": False,
            "has_numbers": False,
            "technical_terms_count": 0,
            "clarity_score": 0.5
        }
        
        if not response or not response.strip():
            return metrics
        
        # Basic metrics
        words = response.split()
        metrics["word_count"] = len(words)
        
        if self.nlp:
            doc = self.nlp(response)
            sentences = list(doc.sents)
            metrics["sentence_count"] = len(sentences)
            metrics["avg_sentence_length"] = metrics["word_count"] / max(1, len(sentences))
            
            # Check for numbers (often indicates specific examples)
            metrics["has_numbers"] = any(token.like_num for token in doc)
            
            # Look for specific example indicators
            example_indicators = ["for example", "such as", "specifically", "in particular", "when i", "i built", "i developed"]
            metrics["has_specific_examples"] = any(ind in response.lower() for ind in example_indicators)
        
        # Simple clarity score based on response characteristics
        clarity = 0.5
        if metrics["word_count"] > 20:
            clarity += 0.1
        if metrics["has_specific_examples"]:
            clarity += 0.2
        if metrics["has_numbers"]:
            clarity += 0.1
        if 10 < metrics["avg_sentence_length"] < 25:
            clarity += 0.1
        
        metrics["clarity_score"] = min(1.0, clarity)
        
        return metrics
    
    def detect_topic(self, text: str) -> Optional[str]:
        """
        Detect the main topic being discussed.
        
        Args:
            text: The text to analyze
            
        Returns:
            Detected topic or None
        """
        topics = {
            "technical_skills": ["programming", "code", "software", "database", "api", "architecture", "deploy"],
            "experience": ["years", "worked", "company", "role", "position", "team", "project"],
            "education": ["degree", "university", "college", "study", "course", "certification"],
            "leadership": ["team", "lead", "manage", "mentor", "coordinate", "supervise"],
            "problem_solving": ["solve", "debug", "fix", "issue", "challenge", "approach", "solution"]
        }
        
        text_lower = text.lower()
        topic_scores = {}
        
        for topic, keywords in topics.items():
            score = sum(1 for kw in keywords if kw in text_lower)
            if score > 0:
                topic_scores[topic] = score
        
        if topic_scores:
            return max(topic_scores, key=topic_scores.get)
        return None
