"""
Video frame analysis for head movement and video quality.
"""
import cv2
import numpy as np
import mediapipe as mp
import logging
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass

from .config import settings

logger = logging.getLogger(__name__)


@dataclass
class HeadPose:
    """Head pose estimation result."""
    yaw: float  # Left/right rotation
    pitch: float  # Up/down rotation
    roll: float  # Tilt


@dataclass
class HeadMovementResult:
    """Result of head movement analysis."""
    status: str  # 'stable', 'fidgety', 'distracted'
    movement_score: float  # 0-1, higher = more movement
    head_pose: Optional[HeadPose] = None
    face_detected: bool = True


@dataclass
class VideoQualityResult:
    """Result of video quality analysis."""
    status: str  # 'good', 'poor', 'acceptable'
    brightness: float  # 0-255
    contrast: float
    face_visible: bool
    face_size_ratio: float  # Face size relative to frame


class VideoAnalyzer:
    """Analyzes video frames for head movement and quality."""
    
    def __init__(self):
        # Initialize MediaPipe Face Mesh
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        
        # History for movement tracking
        self.pose_history: List[HeadPose] = []
        self.max_history = 10
        
        # Key landmark indices for pose estimation
        # Nose tip, chin, left eye, right eye, left mouth, right mouth
        self.pose_landmarks = [1, 152, 33, 263, 61, 291]
        
        logger.info("VideoAnalyzer initialized")
    
    def analyze_frame(
        self,
        frame: np.ndarray,
        round_id: str = ""
    ) -> Tuple[HeadMovementResult, VideoQualityResult]:
        """
        Analyze a video frame.
        
        Args:
            frame: BGR image as numpy array
            round_id: Interview round ID for tracking
            
        Returns:
            Tuple of (HeadMovementResult, VideoQualityResult)
        """
        # Convert to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Analyze video quality
        quality_result = self._analyze_video_quality(frame)
        
        # Detect face and analyze head movement
        movement_result = self._analyze_head_movement(rgb_frame, frame.shape)
        
        # Update quality result with face info
        quality_result.face_visible = movement_result.face_detected
        
        return movement_result, quality_result
    
    def _analyze_head_movement(
        self,
        rgb_frame: np.ndarray,
        frame_shape: Tuple[int, int, int]
    ) -> HeadMovementResult:
        """Analyze head movement using face landmarks."""
        try:
            results = self.face_mesh.process(rgb_frame)
            
            if not results.multi_face_landmarks:
                return HeadMovementResult(
                    status="distracted",
                    movement_score=1.0,
                    face_detected=False,
                )
            
            landmarks = results.multi_face_landmarks[0]
            h, w = frame_shape[:2]
            
            # Get key points for pose estimation
            points_3d = []
            points_2d = []
            
            for idx in self.pose_landmarks:
                lm = landmarks.landmark[idx]
                x, y = int(lm.x * w), int(lm.y * h)
                points_2d.append([x, y])
                points_3d.append([lm.x, lm.y, lm.z])
            
            points_2d = np.array(points_2d, dtype=np.float64)
            points_3d = np.array(points_3d, dtype=np.float64)
            
            # Estimate head pose
            head_pose = self._estimate_head_pose(points_2d, points_3d, frame_shape)
            
            # Calculate movement from pose history
            movement_score = self._calculate_movement_score(head_pose)
            
            # Determine status
            if movement_score < 0.2:
                status = "stable"
            elif movement_score < 0.5:
                status = "fidgety"
            else:
                status = "distracted"
            
            return HeadMovementResult(
                status=status,
                movement_score=round(movement_score, 3),
                head_pose=head_pose,
                face_detected=True,
            )
            
        except Exception as e:
            logger.error(f"Head movement analysis failed: {e}")
            return HeadMovementResult(
                status="unknown",
                movement_score=0.5,
                face_detected=False,
            )
    
    def _estimate_head_pose(
        self,
        points_2d: np.ndarray,
        points_3d: np.ndarray,
        frame_shape: Tuple[int, int, int]
    ) -> HeadPose:
        """Estimate head pose from facial landmarks."""
        h, w = frame_shape[:2]
        
        # Camera matrix (assuming center of image)
        focal_length = w
        center = (w / 2, h / 2)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype=np.float64)
        
        # 3D model points (generic face model)
        model_points = np.array([
            [0.0, 0.0, 0.0],          # Nose tip
            [0.0, -330.0, -65.0],     # Chin
            [-225.0, 170.0, -135.0],  # Left eye
            [225.0, 170.0, -135.0],   # Right eye
            [-150.0, -150.0, -125.0], # Left mouth
            [150.0, -150.0, -125.0],  # Right mouth
        ], dtype=np.float64)
        
        # Solve PnP
        dist_coeffs = np.zeros((4, 1))
        success, rotation_vec, translation_vec = cv2.solvePnP(
            model_points,
            points_2d,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE
        )
        
        if not success:
            return HeadPose(yaw=0, pitch=0, roll=0)
        
        # Convert rotation vector to Euler angles
        rotation_mat, _ = cv2.Rodrigues(rotation_vec)
        
        # Get Euler angles
        sy = np.sqrt(rotation_mat[0, 0] ** 2 + rotation_mat[1, 0] ** 2)
        singular = sy < 1e-6
        
        if not singular:
            pitch = np.arctan2(rotation_mat[2, 1], rotation_mat[2, 2])
            yaw = np.arctan2(-rotation_mat[2, 0], sy)
            roll = np.arctan2(rotation_mat[1, 0], rotation_mat[0, 0])
        else:
            pitch = np.arctan2(-rotation_mat[1, 2], rotation_mat[1, 1])
            yaw = np.arctan2(-rotation_mat[2, 0], sy)
            roll = 0
        
        # Convert to degrees
        return HeadPose(
            yaw=round(float(np.degrees(yaw)), 2),
            pitch=round(float(np.degrees(pitch)), 2),
            roll=round(float(np.degrees(roll)), 2),
        )
    
    def _calculate_movement_score(self, current_pose: HeadPose) -> float:
        """Calculate movement score based on pose history."""
        # Add to history
        self.pose_history.append(current_pose)
        
        # Keep only recent history
        if len(self.pose_history) > self.max_history:
            self.pose_history = self.pose_history[-self.max_history:]
        
        # Need at least 2 frames for comparison
        if len(self.pose_history) < 2:
            return 0.0
        
        # Calculate variance in each axis
        yaws = [p.yaw for p in self.pose_history]
        pitches = [p.pitch for p in self.pose_history]
        rolls = [p.roll for p in self.pose_history]
        
        yaw_var = np.std(yaws)
        pitch_var = np.std(pitches)
        roll_var = np.std(rolls)
        
        # Normalize (assuming 30 degrees is high movement)
        movement = (yaw_var + pitch_var + roll_var) / (3 * 30)
        
        return min(float(movement), 1.0)
    
    def _analyze_video_quality(self, frame: np.ndarray) -> VideoQualityResult:
        """Analyze video quality metrics."""
        try:
            # Convert to grayscale for brightness/contrast
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Calculate brightness (mean pixel value)
            brightness = float(np.mean(gray))
            
            # Calculate contrast (standard deviation)
            contrast = float(np.std(gray))
            
            # Determine quality status
            if (settings.video_quality_brightness_min <= brightness <= settings.video_quality_brightness_max
                and contrast > 30):
                status = "good"
            elif contrast < 20:
                status = "poor"
            else:
                status = "acceptable"
            
            return VideoQualityResult(
                status=status,
                brightness=round(brightness, 2),
                contrast=round(contrast, 2),
                face_visible=True,  # Updated later
                face_size_ratio=0.0,  # Updated by face detection
            )
            
        except Exception as e:
            logger.error(f"Video quality analysis failed: {e}")
            return VideoQualityResult(
                status="unknown",
                brightness=0,
                contrast=0,
                face_visible=False,
                face_size_ratio=0,
            )
    
    def reset_history(self):
        """Reset pose history (for new interview)."""
        self.pose_history = []


# Global instance
video_analyzer = VideoAnalyzer()
