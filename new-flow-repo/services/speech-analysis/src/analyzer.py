"""
Audio analysis for speech confidence and hesitation detection.
"""
import numpy as np
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from .config import settings

logger = logging.getLogger(__name__)


@dataclass
class HesitationResult:
    """Result of hesitation detection."""
    type: str  # 'filler_word', 'long_pause', 'false_start'
    start_ms: int
    end_ms: int
    duration_ms: int
    word: Optional[str] = None


@dataclass
class ConfidenceResult:
    """Result of confidence analysis."""
    score: float  # 0.0 to 1.0
    indicators: List[str]
    window_start_ms: int
    window_end_ms: int


class AudioAnalyzer:
    """Analyzes audio for confidence and hesitation patterns."""
    
    def __init__(self):
        self.filler_words = set(w.lower() for w in settings.filler_words)
        self.pause_threshold_ms = settings.hesitation_pause_threshold_ms
    
    def detect_hesitations(
        self,
        words: List[Dict[str, Any]],
        transcript: str
    ) -> List[HesitationResult]:
        """
        Detect hesitations in speech.
        
        Args:
            words: List of word objects with timing info
            transcript: Full transcript text
            
        Returns:
            List of detected hesitations
        """
        hesitations = []
        
        # Detect filler words
        for word in words:
            word_text = word["word"].lower().strip()
            if word_text in self.filler_words:
                hesitations.append(HesitationResult(
                    type="filler_word",
                    start_ms=word["start"],
                    end_ms=word["end"],
                    duration_ms=word["end"] - word["start"],
                    word=word_text,
                ))
        
        # Detect long pauses between words
        for i in range(1, len(words)):
            prev_word = words[i - 1]
            curr_word = words[i]
            
            pause_duration = curr_word["start"] - prev_word["end"]
            
            if pause_duration > self.pause_threshold_ms:
                hesitations.append(HesitationResult(
                    type="long_pause",
                    start_ms=prev_word["end"],
                    end_ms=curr_word["start"],
                    duration_ms=pause_duration,
                ))
        
        # Detect false starts (repeated words)
        for i in range(1, len(words)):
            prev_word = words[i - 1]["word"].lower().strip()
            curr_word = words[i]["word"].lower().strip()
            
            if prev_word == curr_word and len(prev_word) > 1:
                hesitations.append(HesitationResult(
                    type="false_start",
                    start_ms=words[i - 1]["start"],
                    end_ms=words[i]["end"],
                    duration_ms=words[i]["end"] - words[i - 1]["start"],
                    word=curr_word,
                ))
        
        return hesitations
    
    def calculate_confidence(
        self,
        words: List[Dict[str, Any]],
        audio_features: Optional[Dict[str, Any]] = None,
        window_start_ms: int = 0,
        window_end_ms: Optional[int] = None
    ) -> ConfidenceResult:
        """
        Calculate speech confidence score.
        
        Args:
            words: List of word objects with timing info
            audio_features: Optional audio feature analysis results
            window_start_ms: Start of analysis window
            window_end_ms: End of analysis window
            
        Returns:
            Confidence analysis result
        """
        indicators = []
        scores = []
        
        if not words:
            return ConfidenceResult(
                score=0.5,
                indicators=["insufficient_data"],
                window_start_ms=window_start_ms,
                window_end_ms=window_end_ms or 0,
            )
        
        # Filter words in window
        if window_end_ms:
            words = [w for w in words if window_start_ms <= w["start"] <= window_end_ms]
        
        if not words:
            return ConfidenceResult(
                score=0.5,
                indicators=["no_speech_in_window"],
                window_start_ms=window_start_ms,
                window_end_ms=window_end_ms or 0,
            )
        
        # 1. Speech rate analysis (words per minute)
        total_duration_ms = words[-1]["end"] - words[0]["start"]
        if total_duration_ms > 0:
            wpm = (len(words) / total_duration_ms) * 60000
            
            # Optimal WPM is around 120-150
            if 120 <= wpm <= 150:
                scores.append(1.0)
                indicators.append("optimal_pace")
            elif 100 <= wpm < 120 or 150 < wpm <= 180:
                scores.append(0.7)
                indicators.append("slightly_off_pace")
            else:
                scores.append(0.4)
                if wpm < 100:
                    indicators.append("slow_pace")
                else:
                    indicators.append("fast_pace")
        
        # 2. Filler word frequency
        filler_count = sum(1 for w in words if w["word"].lower().strip() in self.filler_words)
        filler_ratio = filler_count / len(words) if words else 0
        
        if filler_ratio < 0.02:
            scores.append(1.0)
            indicators.append("minimal_fillers")
        elif filler_ratio < 0.05:
            scores.append(0.7)
            indicators.append("some_fillers")
        else:
            scores.append(0.3)
            indicators.append("frequent_fillers")
        
        # 3. Pause patterns
        pauses = []
        for i in range(1, len(words)):
            pause = words[i]["start"] - words[i - 1]["end"]
            if pause > 0:
                pauses.append(pause)
        
        if pauses:
            avg_pause = np.mean(pauses)
            pause_std = np.std(pauses)
            
            # Consistent pauses indicate confidence
            if avg_pause < 500 and pause_std < 300:
                scores.append(1.0)
                indicators.append("consistent_pauses")
            elif avg_pause < 1000 and pause_std < 500:
                scores.append(0.7)
                indicators.append("moderate_pauses")
            else:
                scores.append(0.4)
                indicators.append("irregular_pauses")
        
        # 4. Word confidence from STT
        word_confidences = [w.get("confidence", 0.8) for w in words]
        avg_word_confidence = np.mean(word_confidences)
        
        if avg_word_confidence > 0.9:
            scores.append(1.0)
            indicators.append("clear_speech")
        elif avg_word_confidence > 0.75:
            scores.append(0.7)
            indicators.append("mostly_clear")
        else:
            scores.append(0.4)
            indicators.append("unclear_speech")
        
        # 5. Audio features (if available)
        if audio_features:
            # Pitch stability
            if "pitch_stability" in audio_features:
                pitch_score = audio_features["pitch_stability"]
                scores.append(pitch_score)
                if pitch_score > 0.8:
                    indicators.append("stable_pitch")
                else:
                    indicators.append("variable_pitch")
            
            # Volume consistency
            if "volume_consistency" in audio_features:
                volume_score = audio_features["volume_consistency"]
                scores.append(volume_score)
                if volume_score > 0.8:
                    indicators.append("consistent_volume")
                else:
                    indicators.append("variable_volume")
        
        # Calculate final score
        final_score = np.mean(scores) if scores else 0.5
        
        return ConfidenceResult(
            score=round(float(final_score), 3),
            indicators=indicators,
            window_start_ms=window_start_ms,
            window_end_ms=window_end_ms or (words[-1]["end"] if words else 0),
        )
    
    def analyze_audio_features(
        self,
        audio_data: np.ndarray,
        sample_rate: int = 16000
    ) -> Dict[str, Any]:
        """
        Analyze raw audio features for confidence scoring.
        
        Args:
            audio_data: Audio samples as numpy array
            sample_rate: Audio sample rate
            
        Returns:
            Dictionary of audio features
        """
        try:
            import librosa
            
            features = {}
            
            # Ensure audio is float and normalized
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32) / 32768.0
            
            # Skip if audio is too short
            if len(audio_data) < sample_rate:  # Less than 1 second
                return features
            
            # 1. Pitch analysis
            try:
                pitches, magnitudes = librosa.piptrack(
                    y=audio_data,
                    sr=sample_rate,
                    fmin=50,
                    fmax=400
                )
                
                # Get the most prominent pitch at each frame
                pitch_values = []
                for t in range(pitches.shape[1]):
                    index = magnitudes[:, t].argmax()
                    pitch = pitches[index, t]
                    if pitch > 0:
                        pitch_values.append(pitch)
                
                if pitch_values:
                    pitch_std = np.std(pitch_values)
                    pitch_mean = np.mean(pitch_values)
                    # Lower relative std = more stable pitch
                    pitch_stability = 1.0 - min(pitch_std / (pitch_mean + 1e-6), 1.0)
                    features["pitch_stability"] = round(float(pitch_stability), 3)
                    features["pitch_mean"] = round(float(pitch_mean), 2)
            except Exception as e:
                logger.warning(f"Pitch analysis failed: {e}")
            
            # 2. Volume/energy analysis
            try:
                rms = librosa.feature.rms(y=audio_data)[0]
                if len(rms) > 0:
                    rms_std = np.std(rms)
                    rms_mean = np.mean(rms)
                    # Lower relative std = more consistent volume
                    volume_consistency = 1.0 - min(rms_std / (rms_mean + 1e-6), 1.0)
                    features["volume_consistency"] = round(float(volume_consistency), 3)
                    features["volume_mean"] = round(float(rms_mean), 4)
            except Exception as e:
                logger.warning(f"Volume analysis failed: {e}")
            
            return features
            
        except ImportError:
            logger.warning("librosa not available for audio feature analysis")
            return {}
        except Exception as e:
            logger.error(f"Audio feature analysis failed: {e}")
            return {}


# Global instance
audio_analyzer = AudioAnalyzer()
