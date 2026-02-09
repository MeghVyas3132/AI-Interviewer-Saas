# Microservices Reference

## AI-Assisted Interview Platform - Python Services Detailed Guide

**Purpose:** Complete reference for Python ML microservices  
**Audience:** ML/Backend developers  
**Tech Stack:** Python 3.11+, FastAPI, Redis, NumPy, MediaPipe, OpenCV

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Speech Analysis Service](#2-speech-analysis-service)
3. [Video Analysis Service](#3-video-analysis-service)
4. [Fraud Detection Service](#4-fraud-detection-service)
5. [NLP Engine Service](#5-nlp-engine-service)
6. [Insight Aggregator Service](#6-insight-aggregator-service)
7. [Common Patterns](#7-common-patterns)
8. [Deployment](#8-deployment)

---

## 1. Service Overview

### Service Matrix

| Service | Port | Primary Purpose | Key Dependencies |
|---------|------|-----------------|------------------|
| speech-analysis | 8001 | Audio → Text → Confidence | Deepgram, Whisper, NumPy |
| video-analysis | 8002 | Video → Engagement metrics | MediaPipe, OpenCV |
| fraud-detection | 8003 | Detect cheating/identity fraud | MediaPipe, FaceNet, MTCNN |
| nlp-engine | 8004 | Resume contradiction detection | OpenAI, spaCy |
| insight-aggregator | 8005 | Combine & prioritize insights | Redis, asyncio |

### Common Project Structure

```
services/{service-name}/
├── Dockerfile
├── requirements.txt
└── src/
    ├── main.py          # FastAPI application
    ├── config.py        # Environment configuration
    └── {module}.py      # Core logic
```

### Shared Configuration Pattern

```python
# src/config.py
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Server
    port: int = 8001
    host: str = "0.0.0.0"
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # Security
    internal_api_key: str
    
    # Service-specific
    # ...
    
    class Config:
        env_file = ".env"

settings = Settings()
```

### Shared Health Check Pattern

```python
# src/main.py
from fastapi import FastAPI
from .config import settings

app = FastAPI(title="Service Name")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "service-name",
        "version": "1.0.0"
    }
```

---

## 2. Speech Analysis Service

### Purpose

Processes audio streams to provide:
- Real-time speech-to-text transcription
- Confidence/hesitation scoring
- Filler word detection
- Pause pattern analysis

### Configuration

```python
# services/speech-analysis/src/config.py
class Settings(BaseSettings):
    port: int = 8001
    redis_url: str = "redis://localhost:6379"
    internal_api_key: str
    
    # Deepgram (primary STT)
    deepgram_api_key: str
    
    # Whisper (fallback STT)
    whisper_model_size: str = "base"  # base, small, medium, large
    
    # Analysis thresholds
    filler_words: list = [
        "um", "uh", "er", "ah", "like", "you know",
        "basically", "actually", "literally", "so",
        "well", "right", "okay", "I mean"
    ]
    hesitation_pause_threshold_ms: int = 1500  # 1.5 seconds
    min_confidence_threshold: float = 0.7
    
    class Config:
        env_file = ".env"
```

### Core Analysis Logic

```python
# services/speech-analysis/src/analyzer.py

@dataclass
class HesitationResult:
    type: str  # 'filler_word', 'long_pause', 'false_start'
    start_ms: int
    end_ms: int
    duration_ms: int
    word: Optional[str] = None

@dataclass
class ConfidenceResult:
    score: float  # 0.0 to 1.0
    indicators: List[str]
    window_start_ms: int
    window_end_ms: int

class AudioAnalyzer:
    def __init__(self):
        self.filler_words = set(settings.filler_words)
        self.pause_threshold_ms = settings.hesitation_pause_threshold_ms
    
    def detect_hesitations(
        self,
        words: List[Dict[str, Any]],
        transcript: str
    ) -> List[HesitationResult]:
        """
        Detect hesitation patterns in speech.
        
        Args:
            words: List of word objects with timing:
                   [{"word": "hello", "start": 100, "end": 300}, ...]
            transcript: Full transcript text
        
        Returns:
            List of detected hesitations
        """
        hesitations = []
        
        # 1. Detect filler words
        for word in words:
            word_text = word["word"].lower().strip()
            if word_text in self.filler_words:
                hesitations.append(HesitationResult(
                    type="filler_word",
                    start_ms=word["start"],
                    end_ms=word["end"],
                    duration_ms=word["end"] - word["start"],
                    word=word_text
                ))
        
        # 2. Detect long pauses
        for i in range(1, len(words)):
            pause_duration = words[i]["start"] - words[i-1]["end"]
            if pause_duration > self.pause_threshold_ms:
                hesitations.append(HesitationResult(
                    type="long_pause",
                    start_ms=words[i-1]["end"],
                    end_ms=words[i]["start"],
                    duration_ms=pause_duration
                ))
        
        # 3. Detect false starts (repeated words)
        for i in range(1, len(words)):
            prev = words[i-1]["word"].lower().strip()
            curr = words[i]["word"].lower().strip()
            if prev == curr and len(prev) > 1:
                hesitations.append(HesitationResult(
                    type="false_start",
                    start_ms=words[i-1]["start"],
                    end_ms=words[i]["end"],
                    duration_ms=words[i]["end"] - words[i-1]["start"],
                    word=curr
                ))
        
        return hesitations
    
    def calculate_confidence(
        self,
        words: List[Dict[str, Any]],
        audio_features: Optional[Dict] = None
    ) -> ConfidenceResult:
        """
        Calculate overall speech confidence score.
        
        Factors:
        - Speech rate (WPM)
        - Filler word frequency
        - Pause patterns
        - Word recognition confidence
        """
        indicators = []
        scores = []
        
        if not words:
            return ConfidenceResult(
                score=0.5,
                indicators=["insufficient_data"],
                window_start_ms=0,
                window_end_ms=0
            )
        
        # 1. Speech rate analysis
        total_duration_ms = words[-1]["end"] - words[0]["start"]
        if total_duration_ms > 0:
            wpm = (len(words) / total_duration_ms) * 60000
            
            if 120 <= wpm <= 150:
                scores.append(1.0)
                indicators.append("optimal_pace")
            elif 100 <= wpm < 120 or 150 < wpm <= 180:
                scores.append(0.7)
                indicators.append("slightly_off_pace")
            else:
                scores.append(0.4)
                indicators.append("slow_pace" if wpm < 100 else "fast_pace")
        
        # 2. Filler word frequency
        filler_count = sum(1 for w in words 
                          if w["word"].lower().strip() in self.filler_words)
        filler_ratio = filler_count / len(words)
        
        if filler_ratio < 0.02:
            scores.append(1.0)
            indicators.append("minimal_fillers")
        elif filler_ratio < 0.05:
            scores.append(0.7)
            indicators.append("some_fillers")
        else:
            scores.append(0.3)
            indicators.append("frequent_fillers")
        
        # 3. Pause consistency
        pauses = [words[i]["start"] - words[i-1]["end"] 
                  for i in range(1, len(words))]
        if pauses:
            avg_pause = np.mean(pauses)
            pause_std = np.std(pauses)
            
            if avg_pause < 500 and pause_std < 300:
                scores.append(1.0)
                indicators.append("consistent_pauses")
            elif avg_pause < 1000:
                scores.append(0.7)
                indicators.append("moderate_pauses")
            else:
                scores.append(0.4)
                indicators.append("irregular_pauses")
        
        # Final score
        final_score = np.mean(scores) if scores else 0.5
        
        return ConfidenceResult(
            score=round(final_score, 2),
            indicators=indicators,
            window_start_ms=words[0]["start"],
            window_end_ms=words[-1]["end"]
        )
```

### Speech-to-Text Integration

```python
# services/speech-analysis/src/stt.py

class DeepgramSTT:
    """Primary STT provider using Deepgram."""
    
    def __init__(self, api_key: str):
        from deepgram import Deepgram
        self.client = Deepgram(api_key)
    
    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int = 16000
    ) -> Dict[str, Any]:
        """
        Transcribe audio to text.
        
        Returns:
            {
                "transcript": "Hello world",
                "words": [
                    {"word": "Hello", "start": 0, "end": 300, "confidence": 0.98},
                    {"word": "world", "start": 350, "end": 600, "confidence": 0.95}
                ],
                "confidence": 0.965
            }
        """
        response = await self.client.transcription.prerecorded(
            {"buffer": audio_data, "mimetype": "audio/raw"},
            {
                "punctuate": True,
                "model": "nova",
                "language": "en",
                "sample_rate": sample_rate
            }
        )
        
        results = response["results"]
        if not results["channels"]:
            return {"transcript": "", "words": [], "confidence": 0}
        
        channel = results["channels"][0]
        alternative = channel["alternatives"][0]
        
        return {
            "transcript": alternative["transcript"],
            "words": alternative["words"],
            "confidence": alternative["confidence"]
        }


class WhisperSTT:
    """Fallback STT using local Whisper model."""
    
    def __init__(self, model_size: str = "base"):
        import whisper
        self.model = whisper.load_model(model_size)
    
    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int = 16000
    ) -> Dict[str, Any]:
        """Transcribe using Whisper."""
        # Convert bytes to numpy array
        audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
        audio_np /= 32768.0  # Normalize
        
        result = self.model.transcribe(
            audio_np,
            word_timestamps=True,
            language="en"
        )
        
        words = []
        for segment in result.get("segments", []):
            for word_data in segment.get("words", []):
                words.append({
                    "word": word_data["word"].strip(),
                    "start": int(word_data["start"] * 1000),
                    "end": int(word_data["end"] * 1000),
                    "confidence": word_data.get("probability", 0.9)
                })
        
        return {
            "transcript": result["text"],
            "words": words,
            "confidence": np.mean([w["confidence"] for w in words]) if words else 0
        }
```

### API Endpoints

```python
# services/speech-analysis/src/main.py

@app.post("/analyze/audio")
async def analyze_audio(request: AudioRequest):
    """Full audio analysis: STT + confidence + hesitation."""
    
    # 1. Transcribe
    stt_result = await stt_provider.transcribe(
        base64.b64decode(request.audio),
        request.sample_rate
    )
    
    # 2. Analyze
    analyzer = AudioAnalyzer()
    hesitations = analyzer.detect_hesitations(
        stt_result["words"],
        stt_result["transcript"]
    )
    confidence = analyzer.calculate_confidence(stt_result["words"])
    
    return {
        "transcript": stt_result["transcript"],
        "words": stt_result["words"],
        "stt_confidence": stt_result["confidence"],
        "confidence": {
            "score": confidence.score,
            "indicators": confidence.indicators
        },
        "hesitations": [asdict(h) for h in hesitations]
    }

@app.post("/transcribe")
async def transcribe_only(request: AudioRequest):
    """STT only, no analysis."""
    result = await stt_provider.transcribe(
        base64.b64decode(request.audio),
        request.sample_rate
    )
    return result
```

---

## 3. Video Analysis Service

### Purpose

Analyzes video frames to provide:
- Head pose estimation
- Engagement scoring
- Video quality metrics
- Movement patterns

### Configuration

```python
# services/video-analysis/src/config.py
class Settings(BaseSettings):
    port: int = 8002
    redis_url: str = "redis://localhost:6379"
    internal_api_key: str
    
    # Analysis
    min_face_detection_confidence: float = 0.5
    engagement_window_frames: int = 30  # ~6 seconds at 5 FPS
    movement_threshold: float = 0.1
```

### Core Analysis Logic

```python
# services/video-analysis/src/analyzer.py
import cv2
import numpy as np
import mediapipe as mp
from dataclasses import dataclass
from typing import List, Optional, Tuple

@dataclass
class HeadPoseResult:
    pitch: float  # Up/down
    yaw: float    # Left/right
    roll: float   # Tilt
    
@dataclass
class EngagementResult:
    score: float  # 0.0 to 1.0
    looking_at_camera: bool
    face_visible: bool
    
@dataclass
class VideoQualityResult:
    brightness: float
    blur_score: float
    is_good_quality: bool

class VideoAnalyzer:
    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # Head pose history for smoothing
        self.pose_history: List[HeadPoseResult] = []
        
    def analyze_frame(self, frame: np.ndarray) -> dict:
        """
        Analyze a single video frame.
        
        Args:
            frame: BGR image as numpy array
        
        Returns:
            Complete frame analysis
        """
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb_frame)
        
        if not results.multi_face_landmarks:
            return {
                "face_detected": False,
                "head_pose": None,
                "engagement": {"score": 0, "looking_at_camera": False},
                "quality": self._analyze_quality(frame)
            }
        
        landmarks = results.multi_face_landmarks[0]
        
        # Head pose
        head_pose = self._estimate_head_pose(landmarks, frame.shape)
        
        # Engagement
        engagement = self._calculate_engagement(head_pose, landmarks)
        
        # Quality
        quality = self._analyze_quality(frame)
        
        return {
            "face_detected": True,
            "head_pose": asdict(head_pose),
            "engagement": asdict(engagement),
            "quality": asdict(quality)
        }
    
    def _estimate_head_pose(
        self,
        landmarks,
        image_shape: Tuple[int, int, int]
    ) -> HeadPoseResult:
        """Estimate head pose from face landmarks."""
        h, w = image_shape[:2]
        
        # Key face points
        nose_tip = landmarks.landmark[1]
        chin = landmarks.landmark[152]
        left_eye = landmarks.landmark[33]
        right_eye = landmarks.landmark[263]
        left_mouth = landmarks.landmark[61]
        right_mouth = landmarks.landmark[291]
        
        # 2D points
        image_points = np.array([
            (nose_tip.x * w, nose_tip.y * h),
            (chin.x * w, chin.y * h),
            (left_eye.x * w, left_eye.y * h),
            (right_eye.x * w, right_eye.y * h),
            (left_mouth.x * w, left_mouth.y * h),
            (right_mouth.x * w, right_mouth.y * h)
        ], dtype=np.float64)
        
        # 3D model points
        model_points = np.array([
            (0.0, 0.0, 0.0),          # Nose tip
            (0.0, -330.0, -65.0),     # Chin
            (-225.0, 170.0, -135.0),  # Left eye
            (225.0, 170.0, -135.0),   # Right eye
            (-150.0, -150.0, -125.0), # Left mouth
            (150.0, -150.0, -125.0)   # Right mouth
        ])
        
        # Camera matrix
        focal_length = w
        center = (w / 2, h / 2)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype=np.float64)
        
        # Solve PnP
        _, rotation_vector, _ = cv2.solvePnP(
            model_points,
            image_points,
            camera_matrix,
            np.zeros((4, 1))
        )
        
        # Convert to Euler angles
        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
        angles = self._rotation_matrix_to_euler(rotation_matrix)
        
        return HeadPoseResult(
            pitch=round(angles[0], 2),
            yaw=round(angles[1], 2),
            roll=round(angles[2], 2)
        )
    
    def _calculate_engagement(
        self,
        head_pose: HeadPoseResult,
        landmarks
    ) -> EngagementResult:
        """Calculate engagement score based on pose and gaze."""
        
        # Looking at camera: yaw and pitch within threshold
        looking_at_camera = (
            abs(head_pose.yaw) < 15 and
            abs(head_pose.pitch) < 10
        )
        
        # Base score from head position
        yaw_score = max(0, 1 - abs(head_pose.yaw) / 45)
        pitch_score = max(0, 1 - abs(head_pose.pitch) / 30)
        
        score = (yaw_score + pitch_score) / 2
        
        return EngagementResult(
            score=round(score, 2),
            looking_at_camera=looking_at_camera,
            face_visible=True
        )
    
    def _analyze_quality(self, frame: np.ndarray) -> VideoQualityResult:
        """Analyze video quality metrics."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Brightness (0-255)
        brightness = np.mean(gray)
        
        # Blur score (higher = sharper)
        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        # Good quality thresholds
        is_good = (
            50 < brightness < 200 and  # Not too dark/bright
            blur_score > 100            # Not too blurry
        )
        
        return VideoQualityResult(
            brightness=round(brightness, 2),
            blur_score=round(blur_score, 2),
            is_good_quality=is_good
        )
```

### API Endpoints

```python
# services/video-analysis/src/main.py

@app.post("/analyze/frame")
async def analyze_frame(request: FrameRequest):
    """Analyze a single video frame."""
    frame_bytes = base64.b64decode(request.frame)
    nparr = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    result = analyzer.analyze_frame(frame)
    return result

@app.post("/analyze/batch")
async def analyze_batch(request: BatchFrameRequest):
    """Analyze multiple frames."""
    results = []
    for frame_b64 in request.frames:
        frame_bytes = base64.b64decode(frame_b64)
        nparr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        results.append(analyzer.analyze_frame(frame))
    return {"results": results}
```

---

## 4. Fraud Detection Service

### Purpose

Detects potential interview fraud:
- Multiple faces in frame
- Face switching (identity change)
- Background voice detection
- Combined with client-side tab switch detection

### Configuration

```python
# services/fraud-detection/src/config.py
class Settings(BaseSettings):
    port: int = 8003
    redis_url: str = "redis://localhost:6379"
    internal_api_key: str
    
    # Face detection
    min_detection_confidence: float = 0.7
    multiple_face_frames_threshold: int = 5  # Consecutive frames
    
    # Face switch
    face_switch_threshold: float = 0.6  # Cosine distance
    face_switch_sustained_ms: int = 3000  # 3 seconds
    
    # Background voice
    voice_detection_threshold: float = 0.8
```

### Multiple Face Detection

```python
# services/fraud-detection/src/detectors.py

class MultipleFaceDetector:
    """Detects when multiple faces appear in frame."""
    
    def __init__(self):
        self.mp_face_detection = mp.solutions.face_detection
        self.face_detection = self.mp_face_detection.FaceDetection(
            model_selection=0,  # Short-range
            min_detection_confidence=settings.min_detection_confidence
        )
        self.history: deque = deque(
            maxlen=settings.multiple_face_frames_threshold
        )
    
    def detect(self, frame: np.ndarray) -> FaceDetectionResult:
        """
        Detect faces in frame.
        
        Returns alert only if multiple faces detected
        in consecutive frames with high confidence.
        """
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_detection.process(rgb_frame)
        
        if not results.detections:
            self.history.append(False)
            return FaceDetectionResult(
                face_count=0,
                confidence=0.0,
                is_alert=False
            )
        
        face_count = len(results.detections)
        confidences = [d.score[0] for d in results.detections]
        avg_confidence = np.mean(confidences)
        
        # Track consecutive multiple-face frames
        self.history.append(face_count > 1)
        
        # Alert only if sustained detection
        consecutive = (
            len(self.history) >= settings.multiple_face_frames_threshold
            and all(self.history)
        )
        
        is_alert = (
            face_count > 1 and
            consecutive and
            avg_confidence >= 0.95
        )
        
        return FaceDetectionResult(
            face_count=face_count,
            confidence=round(avg_confidence, 3),
            is_alert=is_alert,
            alert_message=f"Multiple faces detected ({face_count})" if is_alert else None
        )
```

### Face Switch Detection

```python
class FaceSwitchDetector:
    """Detects if the person changes during interview."""
    
    def __init__(self):
        from facenet_pytorch import MTCNN, InceptionResnetV1
        import torch
        
        self.device = torch.device(
            'cuda' if torch.cuda.is_available() else 'cpu'
        )
        
        # Face detection
        self.mtcnn = MTCNN(
            image_size=160,
            margin=20,
            keep_all=False,
            device=self.device,
            post_process=True
        )
        
        # Face embedding
        self.resnet = InceptionResnetV1(
            pretrained='vggface2'
        ).eval().to(self.device)
        
        # Reference embedding (first face seen)
        self.reference_embedding: Optional[np.ndarray] = None
        self.different_face_start_ms: Optional[int] = None
    
    def check(
        self,
        frame: np.ndarray,
        timestamp_ms: int
    ) -> FaceSwitchResult:
        """
        Check if current face matches reference.
        
        Alert only if different face sustained for 3+ seconds.
        """
        import torch
        
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        face = self.mtcnn(rgb_frame)
        
        if face is None:
            return FaceSwitchResult(
                is_same_person=True,
                confidence=0.0,
                distance=0.0
            )
        
        # Get embedding
        with torch.no_grad():
            embedding = self.resnet(
                face.unsqueeze(0).to(self.device)
            ).cpu().numpy()[0]
        
        # Set reference on first detection
        if self.reference_embedding is None:
            self.reference_embedding = embedding
            return FaceSwitchResult(
                is_same_person=True,
                confidence=1.0,
                distance=0.0
            )
        
        # Compare with reference
        distance = self._cosine_distance(
            self.reference_embedding,
            embedding
        )
        
        is_same = distance < settings.face_switch_threshold
        
        # Track sustained different face
        if not is_same:
            if self.different_face_start_ms is None:
                self.different_face_start_ms = timestamp_ms
            
            duration_ms = timestamp_ms - self.different_face_start_ms
            is_alert = duration_ms >= settings.face_switch_sustained_ms
        else:
            self.different_face_start_ms = None
            is_alert = False
        
        return FaceSwitchResult(
            is_same_person=is_same,
            confidence=1 - distance,
            distance=round(distance, 3),
            is_alert=is_alert,
            alert_message="Face switch detected" if is_alert else None
        )
    
    def _cosine_distance(self, a: np.ndarray, b: np.ndarray) -> float:
        return 1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
```

### API Endpoints

```python
# services/fraud-detection/src/main.py

@app.post("/detect/multiple-faces")
async def detect_multiple_faces(request: FrameRequest):
    """Detect multiple faces in frame."""
    frame = decode_frame(request.frame)
    result = multi_face_detector.detect(frame)
    return asdict(result)

@app.post("/detect/face-switch")
async def detect_face_switch(request: FrameWithTimestamp):
    """Check for identity change."""
    frame = decode_frame(request.frame)
    result = face_switch_detector.check(frame, request.timestamp)
    return asdict(result)

@app.post("/reset/{round_id}")
async def reset_detectors(round_id: str):
    """Reset detectors for new interview."""
    multi_face_detector.reset()
    face_switch_detector.reset()
    return {"status": "reset"}
```

---

## 5. NLP Engine Service

### Purpose

Semantic analysis for:
- Resume contradiction detection
- Skill verification
- Follow-up question generation

### Configuration

```python
# services/nlp-engine/src/config.py
class Settings(BaseSettings):
    port: int = 8004
    redis_url: str = "redis://localhost:6379"
    internal_api_key: str
    
    # LLM
    openai_api_key: str
    anthropic_api_key: Optional[str] = None
    llm_model: str = "gpt-4"
    
    # Thresholds
    contradiction_confidence_threshold: float = 0.8
    skill_verification_threshold: float = 0.7
```

### Resume Contradiction Analysis

```python
# services/nlp-engine/src/analyzer.py

class ResumeContradictionAnalyzer:
    """Analyzes responses against resume claims."""
    
    def __init__(self, openai_client):
        self.client = openai_client
        
        self.prompt = """You are an expert interview analyst.

RESUME:
{resume_json}

TRANSCRIPT (what candidate said):
{transcript}

JOB: {job_title}

Analyze for contradictions:
1. TIMELINE: Date/duration mismatches
2. SKILL: Expertise level discrepancies
3. EXPERIENCE: Years/scope mismatches
4. ROLE: Responsibility contradictions

Respond in JSON:
{{
    "has_contradiction": true/false,
    "confidence": 0.0-1.0,
    "contradiction_type": "timeline|skill|experience|role|null",
    "description": "Brief description",
    "resume_claim": "What resume says",
    "spoken_claim": "What candidate said",
    "severity": "low|medium|high",
    "followup_questions": ["Q1", "Q2"]
}}

Only flag HIGH confidence contradictions (>0.8).
Be conservative - don't flag ambiguous statements.
Respond with ONLY JSON."""

    async def analyze_contradiction(
        self,
        resume_data: Dict,
        transcript: str,
        job_title: str = "Software Engineer"
    ) -> ContradictionResult:
        """
        Analyze transcript against resume.
        
        Returns contradiction only if confidence >= threshold.
        """
        prompt = self.prompt.format(
            resume_json=json.dumps(resume_data, indent=2),
            transcript=transcript,
            job_title=job_title
        )
        
        response = await self.client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1  # Low temperature for consistency
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Filter low confidence
        if result.get("confidence", 0) < settings.contradiction_confidence_threshold:
            return ContradictionResult(
                has_contradiction=False,
                confidence=result.get("confidence", 0)
            )
        
        return ContradictionResult(
            has_contradiction=result["has_contradiction"],
            confidence=result["confidence"],
            contradiction_type=result.get("contradiction_type"),
            description=result.get("description"),
            resume_claim=result.get("resume_claim"),
            spoken_claim=result.get("spoken_claim"),
            severity=result.get("severity", "low"),
            followup_questions=result.get("followup_questions", [])
        )
```

---

## 6. Insight Aggregator Service

### Purpose

Central hub that:
- Collects insights from all services
- Deduplicates and merges
- Applies confidence thresholds
- Prioritizes and rate-limits
- Generates recommendations

### Aggregation Logic

```python
# services/insight-aggregator/src/aggregator.py

class InsightAggregator:
    def __init__(self):
        self.buffer: Dict[str, List[Dict]] = defaultdict(list)
        self.recent_alerts: Dict[str, datetime] = {}
        
        # Priority (lower = higher priority)
        self.priority = {
            "fraud": 1,
            "contradiction": 2,
            "speech": 3,
            "video": 4
        }
    
    async def aggregate(self, round_id: str) -> InsightBatch:
        """Aggregate buffered insights."""
        raw = self.buffer.get(round_id, [])
        
        if not raw:
            return InsightBatch(round_id=round_id, insights=[], recommendations=[])
        
        # 1. Group by category and type
        grouped = self._group_insights(raw)
        
        # 2. Aggregate each group
        aggregated = []
        for key, insights in grouped.items():
            agg = self._aggregate_group(key, insights)
            if agg and agg.confidence >= settings.min_confidence:
                aggregated.append(agg)
        
        # 3. Sort by priority
        aggregated.sort(key=lambda x: (
            self.priority.get(x.category, 99),
            -x.confidence
        ))
        
        # 4. Rate limit alerts
        aggregated = self._rate_limit(aggregated)
        
        # 5. Mark alerts
        for insight in aggregated:
            insight.is_alert = self._should_alert(insight)
        
        # 6. Generate recommendations
        recommendations = self._generate_recommendations(aggregated)
        
        return InsightBatch(
            round_id=round_id,
            insights=aggregated[:settings.max_per_batch],
            recommendations=recommendations
        )
    
    def _should_alert(self, insight: AggregatedInsight) -> bool:
        """Determine if insight should be an alert."""
        # Fraud is always alert-worthy
        if insight.category == "fraud" and insight.confidence >= 0.95:
            return True
        
        # High severity with high confidence
        if insight.severity == "high" and insight.confidence >= 0.85:
            return True
        
        # Contradiction is important
        if insight.category == "contradiction" and insight.confidence >= 0.85:
            return True
        
        return False
    
    def _rate_limit(
        self,
        insights: List[AggregatedInsight]
    ) -> List[AggregatedInsight]:
        """Rate limit alerts per category."""
        now = datetime.utcnow()
        filtered = []
        
        for insight in insights:
            if not insight.is_alert:
                filtered.append(insight)
                continue
            
            # Check cooldown
            key = f"{insight.category}:{insight.insight_type}"
            last_alert = self.recent_alerts.get(key)
            
            if last_alert:
                elapsed = (now - last_alert).total_seconds()
                if elapsed < settings.alert_cooldown_seconds:
                    continue  # Skip - too soon
            
            self.recent_alerts[key] = now
            filtered.append(insight)
        
        return filtered
```

---

## 7. Common Patterns

### Redis Stream Consumer

```python
async def consume_stream(stream_pattern: str, handler: Callable):
    """Generic stream consumer."""
    last_id = '0'
    
    while True:
        try:
            results = await redis.xread(
                {stream_pattern: last_id},
                count=10,
                block=1000
            )
            
            for stream_name, messages in results:
                for msg_id, fields in messages:
                    await handler(stream_name, fields)
                    last_id = msg_id
                    
        except Exception as e:
            logger.error(f"Stream consumer error: {e}")
            await asyncio.sleep(1)
```

### Insight Publishing

```python
async def publish_insight(round_id: str, insight: Dict):
    """Publish insight to aggregator."""
    await redis.publish(
        'insights:new',
        json.dumps({
            "roundId": round_id,
            "timestamp": datetime.utcnow().isoformat(),
            **insight
        })
    )
```

---

## 8. Deployment

### Dockerfile Template

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/

# Run
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Requirements Template

```
# requirements.txt
fastapi>=0.100.0
uvicorn>=0.22.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
redis>=4.5.0
numpy>=1.24.0
opencv-python-headless>=4.8.0
mediapipe>=0.10.0
```

---

*For API contracts, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)*
