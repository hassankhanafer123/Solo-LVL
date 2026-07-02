# Production image for the Solo Leveling Life Python API.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code only (no .env, tests, or scripts — secrets come from the host env).
COPY app ./app

EXPOSE 8080

# gunicorn with uvicorn workers = production ASGI server (not the dev `uvicorn`).
# WEB_CONCURRENCY tunes worker count; PORT lets the platform override the bind.
CMD ["sh", "-c", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT:-8080} -w ${WEB_CONCURRENCY:-2} --timeout 60 --access-logfile - --error-logfile -"]
