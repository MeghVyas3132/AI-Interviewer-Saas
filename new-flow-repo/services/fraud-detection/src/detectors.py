"""
Fraud detection analyzers for face detection, face switching, and background voice.
"""
import cv2
import numpy as np
import logging
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from collections import deque
import mediapipe as mp

from .config import settings

logger = logging.getLogger(__name__)


@dataclass
class FaceDetectionResult:
    """Result of face detection."""
    face_count: int
    confidence: float
    bounding_boxes: List[Dict[str, int]] = field(default_factory=list)
    is_alert: bool = False
    alert_message: Optional[str] = None


@dataclass
class FaceSwitchResult:
    """Result of face switch detection."""
    is_same_person: bool
    confidence: float
    distance: float
    is_alert: bool = False
    alert_message: Optional[str] = None


@dataclass
class BackgroundVoiceResult:
    """Result of background voice detection."""
    voices_detected: int
    is_alert: bool = False
    confidence: float = 0.0
    alert_message: Optional[str] = None


class MultipleFaceDetector:
    """Detects multiple faces in a frame."""
    
    def __init__(self):
        # Use MediaPipe Face Detection for speed
        self.mp_face_detection = mp.solutions.face_detection
        self.face_detection = self.mp_face_detection.FaceDetection(
            model_selection=0,  # 0 for short-range, 1 for full-range
            min_detection_confidence=settings.min_detection_confidence
        )
        
        # Track consecutive frames with multiple faces
        self.multiple_face_history: deque = deque(maxlen=settings.multiple_face_frames_threshold)
        
        logger.info("MultipleFaceDetector initialized")
    
    def detect(self, frame: np.ndarray) -> FaceDetectionResult:
        """
        Detect faces in a frame.
        
        Args:
            frame: BGR image as numpy array
            
        Returns:
            FaceDetectionResult with face count and alert status
        """
        try:
            # Convert to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Detect faces
            results = self.face_detection.process(rgb_frame)
            
            if not results.detections:
                return FaceDetectionResult(
                    face_count=0,
                    confidence=0.0,
                    is_alert=False,
                )
            
            face_count = len(results.detections)
            h, w = frame.shape[:2]
            
            # Get bounding boxes
            bounding_boxes = []
            confidences = []
            
            for detection in results.detections:
                bbox = detection.location_data.relative_bounding_box
                bounding_boxes.append({
                    "x": int(bbox.xmin * w),
                    "y": int(bbox.ymin * h),
                    "width": int(bbox.width * w),
                    "height": int(bbox.height * h),
                })
                confidences.append(detection.score[0])
            
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            
            # Track history for consecutive detection
            self.multiple_face_history.append(face_count > 1)
            
            # Alert only if multiple faces detected in consecutive frames
            consecutive_multiple = (
                len(self.multiple_face_history) >= settings.multiple_face_frames_threshold
                and all(self.multiple_face_history)
            )
            
            is_alert = face_count > 1 and consecutive_multiple and avg_confidence >= 0.95
            
            return FaceDetectionResult(
                face_count=face_count,
                confidence=round(avg_confidence, 3),
                bounding_boxes=bounding_boxes,
                is_alert=is_alert,
                alert_message=f"Multiple faces detected ({face_count})" if is_alert else None,
            )
            
        except Exception as e:
            logger.error(f"Face detection failed: {e}")
            return FaceDetectionResult(face_count=0, confidence=0.0)
    
    def reset(self):
        """Reset detection history."""
        self.multiple_face_history.clear()


class FaceSwitchDetector:
    """Detects if the same person is present throughout the interview."""
    
    def __init__(self):
        try:
            from facenet_pytorch import MTCNN, InceptionResnetV1
            import torch
            
            # Device selection
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            
            # Face detection
            self.mtcnn = MTCNN(
                image_size=160,
                margin=20,
                keep_all=False,
                device=self.device,
                post_process=True,
            )
            
            # Face embedding model
            self.resnet = InceptionResnetV1(pretrained='vggface2').eval().to(self.device)
            
            # Store reference embedding (first face seen)
            self.reference_embedding: Optional[np.ndarray] = None
            self.reference_set_at_ms: int = 0
            
            # Track consecutive different faces
            self.different_face_start_ms: Optional[int] = None
            
            self._available = True
            logger.info("FaceSwitchDetector initialized")
            
        except ImportError as e:
            logger.warning(f"Face recognition not available: {e}")
            self._available = False
    
    def check(
        self,
        frame: np.ndarray,
        timestamp_ms: int
    ) -> FaceSwitchResult:
        """
        Check if the current face matches the reference face.
        
        Args:
            frame: BGR image as numpy array
            timestamp_ms: Current timestamp in milliseconds
            
        Returns:
            FaceSwitchResult with match status
        """
        if not self._available:
            return FaceSwitchResult(
                is_same_person=True,
                confidence=0.0,
                distance=0.0,
            )
        
        try:
            import torch
            
            # Convert to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Detect and extract face
            face = self.mtcnn(rgb_frame)
            
            if face is None:
                # No face detected
                return FaceSwitchResult(
                    is_same_person=True,  # Can't determine without face
                    confidence=0.0,
                    distance=0.0,
                )
            
            # Get embedding
            with torch.no_grad():
                embedding = self.resnet(face.unsqueeze(0).to(self.device))
                embedding = embedding.cpu().numpy()[0]
            
            # Set reference if not set
            if self.reference_embedding is None:
                self.reference_embedding = embedding
                self.reference_set_at_ms = timestamp_ms
                return FaceSwitchResult(
                    is_same_person=True,
                    confidence=1.0,
                    distance=0.0,
                )
            
            # Calculate distance to reference
            distance = np.linalg.norm(self.reference_embedding - embedding)
            is_same = distance < settings.face_embedding_threshold
            confidence = max(0, 1 - (distance / settings.face_embedding_threshold))
            
            # Track consecutive different faces
            if not is_same:
                if self.different_face_start_ms is None:
                    self.different_face_start_ms = timestamp_ms
                
                duration = timestamp_ms - self.different_face_start_ms
                is_alert = duration >= settings.face_switch_duration_threshold_ms
            else:
                self.different_face_start_ms = None
                is_alert = False
            
            return FaceSwitchResult(
                is_same_person=is_same,
                confidence=round(float(confidence), 3),
                distance=round(float(distance), 4),
                is_alert=is_alert,
                alert_message="Different person detected" if is_alert else None,
            )
            
        except Exception as e:
            logger.error(f"Face switch check failed: {e}")
            return FaceSwitchResult(
                is_same_person=True,
                confidence=0.0,
                distance=0.0,
            )
    
    def reset(self):
        """Reset detector (new interview)."""
        self.reference_embedding = None
        self.reference_set_at_ms = 0
        self.different_face_start_ms = None


class BackgroundVoiceDetector:
    """Detects background voices (potential cheating assistance)."""
    
    def __init__(self):
        self._available = True
        try:
            import librosa
            logger.info("BackgroundVoiceDetector initialized")
        except ImportError:
            logger.warning("librosa not available for voice detection")
            self._available = False
    
    def detect(
        self,
        audio_data: np.ndarray,
        sample_rate: int = 16000
    ) -> BackgroundVoiceResult:
        """
        Detect if there are multiple voices in audio.
        
        This is a simplified implementation. In production, you would use
        speaker diarization models like pyannote.audio.
        
        Args:
            audio_data: Audio samples as numpy array
            sample_rate: Audio sample rate
            
        Returns:
            BackgroundVoiceResult with detection status
        """
        if not self._available or len(audio_data) < sample_rate:
            return BackgroundVoiceResult(voices_detected=1, confidence=0.0)
        
        try:
            import librosa
            
            # Convert to float if needed
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32) / 32768.0
            
            # Simple energy-based voice activity detection
            # Split into segments and analyze
            segment_length = sample_rate // 4  # 250ms segments
            segments = [
                audio_data[i:i + segment_length]
                for i in range(0, len(audio_data) - segment_length, segment_length)
            ]
            
            # Calculate RMS energy for each segment
            energies = [np.sqrt(np.mean(seg ** 2)) for seg in segments]
            
            # Detect voice activity
            voice_active = [e > settings.voice_energy_threshold for e in energies]
            
            # Look for patterns suggesting multiple speakers
            # (rapid alternation of high energy segments)
            transitions = sum(
                1 for i in range(1, len(voice_active))
                if voice_active[i] != voice_active[i - 1]
            )
            
            # High transitions might indicate multiple speakers
            # This is a very simplified heuristic
            suspicious = transitions > len(voice_active) * 0.4
            
            return BackgroundVoiceResult(
                voices_detected=2 if suspicious else 1,
                is_alert=suspicious,
                confidence=0.6 if suspicious else 0.0,  # Low confidence for this method
                alert_message="Possible multiple voices detected" if suspicious else None,
            )
            
        except Exception as e:
            logger.error(f"Background voice detection failed: {e}")
            return BackgroundVoiceResult(voices_detected=1, confidence=0.0)


# Global instances
multiple_face_detector = MultipleFaceDetector()
face_switch_detector = FaceSwitchDetector()
background_voice_detector = BackgroundVoiceDetector()
