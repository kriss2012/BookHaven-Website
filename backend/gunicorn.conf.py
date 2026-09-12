"""
Gunicorn Configuration for BookHaven API
========================================
Optimized for Render Free Tier (512MB RAM low-resource environment).
"""

import os
import multiprocessing

# Bind to 0.0.0.0:$PORT (Render injects $PORT)
port = os.getenv("PORT", "8000")
bind = f"0.0.0.0:{port}"

# Free tier memory optimization: keep worker count low to avoid OOM
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
threads = int(os.getenv("GUNICORN_THREADS", "2"))
worker_class = "gthread"

# Timeouts
timeout = 60
graceful_timeout = 30
keepalive = 2

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# Process naming
proc_name = "bookhaven_api"
