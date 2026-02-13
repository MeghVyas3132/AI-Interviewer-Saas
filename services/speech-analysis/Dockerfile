FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# NOTE: downloading the Whisper model at build time is heavy and can cause
# build failures and unnecessarily large images. Defer model download to
# runtime or a separate setup step. If you need to pre-download the model,
# uncomment the line below.
# RUN python -c "import whisper; whisper.load_model('base')"

# Copy source code
COPY src/ ./src/

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Start server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
