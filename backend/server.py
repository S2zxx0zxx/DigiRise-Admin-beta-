# DigiRise Partner OS is a static HTML/CSS/JS Firebase app with no Python backend.
# Supervisor still expects a backend process, so we ship a tiny no-op FastAPI
# app to keep supervisor healthy without adding any server-side surface area.
from fastapi import FastAPI

app = FastAPI(title="digirise-noop-backend")


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "digirise-noop-backend"}
