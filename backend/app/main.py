import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="SchCatWeb API",
    version="0.1.0",
    description="Backend foundation for the SchCatWeb stock-analysis terminal.",
)

origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["system"])
async def health_check() -> dict[str, str]:
    """Return a lightweight status response for local and deployment checks."""
    return {"status": "ok", "service": "schcatweb-api", "version": app.version}
