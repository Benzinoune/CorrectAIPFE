FROM python:3.11-slim

# Install Tesseract OCR + French language support + OpenCV deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-fra libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend-ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend-ai/ .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]
