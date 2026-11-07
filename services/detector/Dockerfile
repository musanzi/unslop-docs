FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HUB_DISABLE_IMPLICIT_TOKEN=1 \
    HF_HUB_DISABLE_XET=1 \
    HF_HUB_DOWNLOAD_TIMEOUT=60 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --create-home detector
COPY core.py ./
RUN python -c "from huggingface_hub import snapshot_download; from core import MODEL_FILES, MODEL_ID, MODEL_REVISION; snapshot_download(MODEL_ID, revision=MODEL_REVISION, allow_patterns=MODEL_FILES)"
ENV HF_HUB_OFFLINE=1
COPY engine.py server.py ./
USER detector
RUN python -c "import engine; import torch; assert torch.isfinite(torch.ones(1)).all()"
EXPOSE 8090
CMD ["python", "server.py"]
