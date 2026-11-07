FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer poppler-utils fonts-liberation fonts-dejavu-core fonts-noto-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.py /app/server.py
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 65534:65534
EXPOSE 8091
CMD ["python", "/app/server.py"]
