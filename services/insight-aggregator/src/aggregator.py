"""
Insight Aggregation Engine

Combines insights from multiple ML services:
- Speech Analysis
- Video Analysis
- Fraud Detection
- NLP Engine

Produces aggregated, deduplicated insights with
recommendations for the interviewer.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field
from collections import defaultdict
import json
import asyncio

from .config import settings

logger = logging.getLogger(__name__)


@dataclass
class AggregatedInsight:
    """An aggregated insight ready for delivery"""
    id: str
    round_id: str
    category: str  # fraud, contradiction, speech, video
    insight_type: str  # specific type within category
    confidence: float
    severity: str  # low, medium, high
    title: str
    description: str
    evidence: List[str] = field(default_factory=list)
    source_services: List[str] = field(default_factory=list)
    followup_questions: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    is_alert: bool = False


@dataclass
class InsightBatch:
    """A batch of insights for a round"""
    round_id: str
    insights: List[AggregatedInsight]
    recommendations: List[Dict[str, Any]]
    summary: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)


class InsightAggregator:
    """
    Aggregates and deduplicates insights from multiple sources.
    Applies confidence thresholds and generates recommendations.
    """
    
    def __init__(self):
        # In-memory insight buffer per round
        self.insight_buffer: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        
        # Track recently sent alerts to avoid duplicates
        self.recent_alerts: Dict[str, datetime] = {}
        
        # Insight counter for IDs
        self.insight_counter = 0
        
        # Category priority for aggregation
        self.category_priority = {
            "fraud": 1,      # Highest priority
            "contradiction": 2,
            "speech": 3,
            "video": 4
        }
        
        # Severity weights for scoring
        self.severity_weights = {
            "high": 3,
            "medium": 2,
            "low": 1
        }
    
    def add_insight(self, round_id: str, insight: Dict[str, Any]):
        """
        Add a raw insight to the buffer for aggregation.
        
        Args:
            round_id: The interview round ID
            insight: Raw insight from a service
        """
        insight["received_at"] = datetime.utcnow()
        self.insight_buffer[round_id].append(insight)
        
        # Clean up old insights from buffer
        self._cleanup_buffer(round_id)
    
    def _cleanup_buffer(self, round_id: str):
        """Remove insights older than the aggregation window"""
        cutoff = datetime.utcnow() - timedelta(seconds=settings.insight_window_seconds * 2)
        self.insight_buffer[round_id] = [
            i for i in self.insight_buffer[round_id]
            if i.get("received_at", datetime.utcnow()) > cutoff
        ]
    
    async def aggregate(self, round_id: str) -> InsightBatch:
        """
        Aggregate buffered insights for a round.
        
        Args:
            round_id: The interview round ID
            
        Returns:
            InsightBatch with aggregated insights and recommendations
        """
        raw_insights = self.insight_buffer.get(round_id, [])
        
        if not raw_insights:
            return InsightBatch(
                round_id=round_id,
                insights=[],
                recommendations=[],
                summary={"total_insights": 0}
            )
        
        # Group by category and type
        grouped = self._group_insights(raw_insights)
        
        # Aggregate each group
        aggregated: List[AggregatedInsight] = []
        
        for key, insights in grouped.items():
            category, insight_type = key
            agg_insight = self._aggregate_group(round_id, category, insight_type, insights)
            if agg_insight:
                aggregated.append(agg_insight)
        
        # Filter by confidence threshold
        aggregated = [
            i for i in aggregated 
            if i.confidence >= settings.min_confidence_threshold
        ]
        
        # Sort by priority and confidence
        aggregated.sort(
            key=lambda x: (
                self.category_priority.get(x.category, 99),
                -x.confidence,
                -self.severity_weights.get(x.severity, 0)
            )
        )
        
        # Limit batch size
        aggregated = aggregated[:settings.max_insights_per_batch]
        
        # Mark high-confidence items as alerts
        for insight in aggregated:
            insight.is_alert = self._should_be_alert(insight)
        
        # Generate recommendations
        recommendations = self._generate_recommendations(aggregated) if settings.generate_recommendations else []
        
        # Create summary
        summary = self._create_summary(aggregated)
        
        return InsightBatch(
            round_id=round_id,
            insights=aggregated,
            recommendations=recommendations,
            summary=summary
        )
    
    def _group_insights(self, insights: List[Dict[str, Any]]) -> Dict[tuple, List[Dict[str, Any]]]:
        """Group insights by category and type"""
        grouped: Dict[tuple, List[Dict[str, Any]]] = defaultdict(list)
        
        for insight in insights:
            source = insight.get("source", "unknown")
            insight_type = insight.get("type", "unknown")
            
            # Map source to category
            category = self._source_to_category(source)
            
            grouped[(category, insight_type)].append(insight)
        
        return grouped
    
    def _source_to_category(self, source: str) -> str:
        """Map service source to insight category"""
        mapping = {
            "speech-analysis": "speech",
            "video-analysis": "video",
            "fraud-detection": "fraud",
            "nlp-engine": "contradiction"
        }
        return mapping.get(source, "other")
    
    def _aggregate_group(
        self, 
        round_id: str, 
        category: str, 
        insight_type: str, 
        insights: List[Dict[str, Any]]
    ) -> Optional[AggregatedInsight]:
        """
        Aggregate a group of similar insights.
        
        Args:
            round_id: Interview round ID
            category: Insight category
            insight_type: Specific insight type
            insights: List of raw insights to aggregate
            
        Returns:
            Aggregated insight or None if not significant
        """
        if not insights:
            return None
        
        self.insight_counter += 1
        insight_id = f"{round_id}-{self.insight_counter}"
        
        # Calculate aggregate confidence (weighted average)
        total_confidence = sum(
            i.get("data", {}).get("confidence", 0.5) 
            for i in insights
        )
        avg_confidence = total_confidence / len(insights)
        
        # Boost confidence if multiple services agree
        source_services = list(set(i.get("source", "unknown") for i in insights))
        if len(source_services) > 1:
            avg_confidence = min(1.0, avg_confidence * 1.1)
        
        # Determine severity
        severities = [i.get("data", {}).get("severity", "low") for i in insights]
        severity = self._aggregate_severity(severities)
        
        # Build evidence list
        evidence = []
        for insight in insights:
            data = insight.get("data", {})
            if "description" in data:
                evidence.append(data["description"])
            if "evidence" in data:
                evidence.extend(data["evidence"])
        evidence = list(set(evidence))[:5]  # Deduplicate and limit
        
        # Collect follow-up questions
        followup_questions = []
        for insight in insights:
            data = insight.get("data", {})
            if "followup_questions" in data:
                followup_questions.extend(data["followup_questions"])
        followup_questions = list(set(followup_questions))[:3]
        
        # Generate title and description
        title = self._generate_title(category, insight_type, insights)
        description = self._generate_description(category, insight_type, insights)
        
        return AggregatedInsight(
            id=insight_id,
            round_id=round_id,
            category=category,
            insight_type=insight_type,
            confidence=avg_confidence,
            severity=severity,
            title=title,
            description=description,
            evidence=evidence,
            source_services=source_services,
            followup_questions=followup_questions
        )
    
    def _aggregate_severity(self, severities: List[str]) -> str:
        """Determine aggregate severity from multiple readings"""
        severity_scores = {"high": 3, "medium": 2, "low": 1}
        if not severities:
            return "low"
        
        avg_score = sum(severity_scores.get(s, 1) for s in severities) / len(severities)
        
        if avg_score >= 2.5:
            return "high"
        elif avg_score >= 1.5:
            return "medium"
        return "low"
    
    def _generate_title(self, category: str, insight_type: str, insights: List[Dict]) -> str:
        """Generate a human-readable title for the insight"""
        titles = {
            ("fraud", "multiple_faces"): "Multiple Faces Detected",
            ("fraud", "face_switch"): "Face Switch Detected",
            ("fraud", "background_voice"): "Background Voice Detected",
            ("contradiction", "contradiction"): "Resume Contradiction Found",
            ("contradiction", "skill_mismatch"): "Skill Level Mismatch",
            ("speech", "low_confidence"): "Low Speaking Confidence",
            ("speech", "high_hesitation"): "High Hesitation Detected",
            ("video", "head_movement"): "Unusual Head Movement",
            ("video", "low_quality"): "Video Quality Issue"
        }
        return titles.get((category, insight_type), f"{category.title()}: {insight_type.replace('_', ' ').title()}")
    
    def _generate_description(self, category: str, insight_type: str, insights: List[Dict]) -> str:
        """Generate a description based on insights"""
        # Get the most detailed description from the insights
        for insight in insights:
            data = insight.get("data", {})
            if "description" in data and data["description"]:
                return data["description"]
        
        # Fallback descriptions
        descriptions = {
            ("fraud", "multiple_faces"): "Multiple people detected in the candidate's video feed. This may indicate someone else is present during the interview.",
            ("fraud", "face_switch"): "The face in the video appears to have changed from the original candidate. Identity verification recommended.",
            ("fraud", "background_voice"): "Additional voices detected in the audio that may indicate coaching or assistance.",
            ("contradiction", "contradiction"): "The candidate's statement contradicts information on their resume.",
            ("contradiction", "skill_mismatch"): "The candidate's demonstrated knowledge doesn't match the expertise level claimed on their resume.",
            ("speech", "low_confidence"): "Speech analysis indicates the candidate may be uncertain about their response.",
            ("speech", "high_hesitation"): "Frequent pauses and filler words detected in the candidate's response.",
            ("video", "head_movement"): "Candidate is looking away from the camera frequently.",
            ("video", "low_quality"): "Video quality is degraded, which may affect analysis accuracy."
        }
        return descriptions.get((category, insight_type), f"Observation in {category}: {insight_type}")
    
    def _should_be_alert(self, insight: AggregatedInsight) -> bool:
        """Determine if an insight should be elevated to an alert"""
        # Check if we recently sent a similar alert
        alert_key = f"{insight.round_id}:{insight.category}:{insight.insight_type}"
        last_alert = self.recent_alerts.get(alert_key)
        
        if last_alert:
            time_since = (datetime.utcnow() - last_alert).total_seconds()
            if time_since < settings.min_alert_interval_seconds:
                return False
        
        # Check confidence thresholds
        if insight.category == "fraud" and insight.confidence >= settings.fraud_alert_confidence:
            self.recent_alerts[alert_key] = datetime.utcnow()
            return True
        
        if insight.category == "contradiction" and insight.confidence >= settings.contradiction_alert_confidence:
            self.recent_alerts[alert_key] = datetime.utcnow()
            return True
        
        # High severity always alerts
        if insight.severity == "high" and insight.confidence >= 0.8:
            self.recent_alerts[alert_key] = datetime.utcnow()
            return True
        
        return False
    
    def _generate_recommendations(self, insights: List[AggregatedInsight]) -> List[Dict[str, Any]]:
        """Generate interviewer recommendations based on insights"""
        recommendations = []
        
        for insight in insights:
            if not insight.is_alert:
                continue
            
            if insight.category == "fraud":
                recommendations.append({
                    "type": "action",
                    "priority": "high",
                    "title": "Verify Candidate Identity",
                    "description": f"Based on {insight.insight_type}, consider verifying the candidate's identity.",
                    "suggested_actions": [
                        "Ask the candidate to show their ID",
                        "Request they pan the camera around the room",
                        "Ask a question only they would know from their application"
                    ],
                    "related_insight_id": insight.id
                })
            
            elif insight.category == "contradiction":
                recommendations.append({
                    "type": "clarification",
                    "priority": "medium",
                    "title": "Clarify Resume Claim",
                    "description": insight.description,
                    "suggested_questions": insight.followup_questions or [
                        "Can you elaborate on that?",
                        "Can you walk me through a specific example?"
                    ],
                    "related_insight_id": insight.id
                })
            
            elif insight.category == "speech" and insight.insight_type == "high_hesitation":
                recommendations.append({
                    "type": "observation",
                    "priority": "low",
                    "title": "Candidate Hesitation Noted",
                    "description": "The candidate appears hesitant. This could indicate uncertainty or nervousness.",
                    "suggested_actions": [
                        "Consider asking for more specific examples",
                        "Give the candidate time to think before answering"
                    ],
                    "related_insight_id": insight.id
                })
        
        return recommendations[:settings.max_recommendations_per_round]
    
    def _create_summary(self, insights: List[AggregatedInsight]) -> Dict[str, Any]:
        """Create a summary of all insights"""
        summary = {
            "total_insights": len(insights),
            "alerts_count": sum(1 for i in insights if i.is_alert),
            "by_category": defaultdict(int),
            "by_severity": defaultdict(int),
            "overall_confidence": 0
        }
        
        for insight in insights:
            summary["by_category"][insight.category] += 1
            summary["by_severity"][insight.severity] += 1
            summary["overall_confidence"] += insight.confidence
        
        if insights:
            summary["overall_confidence"] /= len(insights)
        
        summary["by_category"] = dict(summary["by_category"])
        summary["by_severity"] = dict(summary["by_severity"])
        
        return summary
    
    def clear_buffer(self, round_id: str):
        """Clear the insight buffer for a round"""
        if round_id in self.insight_buffer:
            del self.insight_buffer[round_id]
    
    def get_buffer_size(self, round_id: str) -> int:
        """Get the current buffer size for a round"""
        return len(self.insight_buffer.get(round_id, []))


class RecommendationEngine:
    """
    Generates AI recommendations for the interviewer based on
    aggregated insights and interview progress.
    """
    
    def __init__(self):
        pass
    
    def generate_overall_assessment(
        self,
        round_id: str,
        insights: List[AggregatedInsight],
        interview_duration_minutes: int
    ) -> Dict[str, Any]:
        """
        Generate an overall assessment for the interview so far.
        
        Args:
            round_id: Interview round ID
            insights: All aggregated insights
            interview_duration_minutes: How long the interview has been going
            
        Returns:
            Assessment dictionary
        """
        # Count significant issues
        fraud_alerts = [i for i in insights if i.category == "fraud" and i.is_alert]
        contradictions = [i for i in insights if i.category == "contradiction" and i.is_alert]
        
        # Calculate risk level
        if len(fraud_alerts) >= 2:
            risk_level = "high"
            risk_explanation = "Multiple fraud indicators detected. Strong recommendation to verify identity."
        elif len(fraud_alerts) == 1 or len(contradictions) >= 2:
            risk_level = "medium"
            risk_explanation = "Some concerns detected. Consider probing specific areas."
        else:
            risk_level = "low"
            risk_explanation = "No significant concerns detected so far."
        
        # Generate next steps
        next_steps = []
        
        if fraud_alerts:
            next_steps.append("Verify candidate identity before proceeding")
        
        if contradictions:
            next_steps.append("Clarify discrepancies in experience claims")
        
        if not next_steps:
            next_steps.append("Continue with planned interview questions")
        
        return {
            "round_id": round_id,
            "interview_duration_minutes": interview_duration_minutes,
            "risk_level": risk_level,
            "risk_explanation": risk_explanation,
            "fraud_indicators": len(fraud_alerts),
            "contradictions_found": len(contradictions),
            "total_insights": len(insights),
            "next_steps": next_steps,
            "generated_at": datetime.utcnow().isoformat()
        }
