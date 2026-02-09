"""
Speech-to-Text service using Deepgram (primary) and Whisper (fallback).
"""
import asyncio
import base64
import json
import logging
from typing import Optional, Dict, Any, List
from deepgram import DeepgramClient, PrerecordedOptions
import whisper
import numpy as np
import io
import soundfile as sf

from .config import settings

logger = logging.getLogger(__name__)


class STTService:
    """Speech-to-Text service with Deepgram primary and Whisper fallback."""
    
    def __init__(self):
        self.deepgram_client: Optional[DeepgramClient] = None
        self.whisper_model = None
        self._initialize_clients()
    
    def _initialize_clients(self):
        """Initialize STT clients."""
        # Initialize Deepgram if API key is available
        if settings.deepgram_api_key:
            try:
                self.deepgram_client = DeepgramClient(settings.deepgram_api_key)
                logger.info("Deepgram client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Deepgram: {e}")
        
        # Initialize Whisper as fallback
        try:
            self.whisper_model = whisper.load_model(settings.whisper_model_size)
            logger.info(f"Whisper model ({settings.whisper_model_size}) loaded")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
    
    async def transcribe_audio(
        self,
        audio_data: bytes,
        sample_rate: int = 16000
    ) -> Dict[str, Any]:
        """
        Transcribe audio data to text.
        
        Args:
            audio_data: Raw audio bytes (PCM format)
            sample_rate: Audio sample rate
            
        Returns:
            Dict with transcript and word-level timestamps
        """
        # Try Deepgram first
        if self.deepgram_client:
            try:
                result = await self._transcribe_deepgram(audio_data, sample_rate)
                if result:
                    return result
            except Exception as e:
                logger.warning(f"Deepgram transcription failed, falling back to Whisper: {e}")
        
        # Fallback to Whisper
        if self.whisper_model:
            return await self._transcribe_whisper(audio_data, sample_rate)
        
        raise RuntimeError("No STT service available")
    
    async def _transcribe_deepgram(
        self,
        audio_data: bytes,
        sample_rate: int
    ) -> Optional[Dict[str, Any]]:
        """Transcribe using Deepgram API."""
        try:
            options = PrerecordedOptions(
                punctuate=True,
                model="nova-2",
                language="en",
                smart_format=True,
                diarize=False,
            )
            
            # Use the sync API wrapped in executor for async compatibility
            response = self.deepgram_client.listen.prerecorded.v("1").transcribe_file(
                {"buffer": audio_data, "mimetype": "audio/wav"},
                options
            )
            
            # Parse response
            channel = response.results.channels[0]
            alternative = channel.alternatives[0]
            
            words = []
            if hasattr(alternative, 'words') and alternative.words:
                for word in alternative.words:
                    words.append({
                        "word": word.word,
                        "start": int(word.start * 1000),  # Convert to ms
                        "end": int(word.end * 1000),
                        "confidence": word.confidence,
                    })
            
            return {
                "transcript": alternative.transcript,
                "words": words,
                "confidence": getattr(alternative, 'confidence', 0),
                "provider": "deepgram",
            }
            
        except Exception as e:
            logger.error(f"Deepgram transcription error: {e}")
            return None
    
    async def _transcribe_whisper(
        self,
        audio_data: bytes,
        sample_rate: int
    ) -> Dict[str, Any]:
        """Transcribe using local Whisper model."""
        try:
            # Convert bytes to numpy array
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Resample to 16kHz if needed (Whisper expects 16kHz)
            if sample_rate != 16000:
                import librosa
                audio_np = librosa.resample(audio_np, orig_sr=sample_rate, target_sr=16000)
            
            # Run transcription in thread pool to not block event loop
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.whisper_model.transcribe(
                    audio_np,
                    language="en",
                    word_timestamps=True,
                )
            )
            
            # Parse word timestamps
            words = []
            if "segments" in result:
                for segment in result["segments"]:
                    if "words" in segment:
                        for word in segment["words"]:
                            words.append({
                                "word": word["word"].strip(),
                                "start": int(word["start"] * 1000),
                                "end": int(word["end"] * 1000),
                                "confidence": word.get("probability", 0.8),
                            })
            
            return {
                "transcript": result["text"],
                "words": words,
                "confidence": 0.8,  # Whisper doesn't provide overall confidence
                "provider": "whisper",
            }
            
        except Exception as e:
            logger.error(f"Whisper transcription error: {e}")
            raise


# Global instance
stt_service = STTService()
