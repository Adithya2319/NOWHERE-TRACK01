"""Transparent baseline; no synthetic training data or accuracy claims."""
from math import isfinite
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

app = FastAPI(title="Campus360 academic forecasting", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

class Assessment(BaseModel):
    maximum: float = Field(gt=0, allow_inf_nan=False)
    score: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_score(self):
        if self.score is not None and self.score > self.maximum:
            raise ValueError("Score exceeds maximum")
        return self

class PredictPayload(BaseModel):
    assessments: list[Assessment] = Field(min_length=1)
    attendance: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)

@app.get("/health")
def health():
    return {"status": "ok", "model": "rule-based", "trained": False}

@app.post("/predict")
def predict(payload: PredictPayload):
    assessed = [a for a in payload.assessments if a.score is not None]
    total = sum(a.maximum for a in payload.assessments)
    assessed_max = sum(a.maximum for a in assessed)
    percentage = sum(a.score for a in assessed) / assessed_max * 100 if assessed_max else None
    return {
        "method": "rule-based",
        "projected_percentage": round(percentage, 4) if percentage is not None else None,
        "coverage": round(assessed_max / total * 100, 4),
        "recommendation": "Review mistakes and practise core concepts." if percentage is not None and percentage < 50 else "Continue spaced practice and complete remaining assessments.",
        "attendance_note": "Review attendance alongside academic progress; it does not alter marks.",
        "note": "Assumes the assessed percentage continues in remaining assessments. No training dataset, accuracy, confidence interval or pass probability is claimed.",
    }
