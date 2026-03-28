from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv
import os

# 🔥 FORCE LOAD .env FROM CURRENT FOLDER
load_dotenv(dotenv_path=".env")

# 🔍 DEBUG (remove later)
print("GEMINI_API_KEY:", os.getenv("GEMINI_API_KEY"))

from copilot.copilot_engine import run_copilot

app = FastAPI()

# ---------------- CORS ----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- REQUEST MODEL ----------------
class CopilotRequest(BaseModel):
    query: str

# ---------------- GLOBAL STATE ----------------
GLOBAL_STATE = {
    "intelligence": {"total_risk": 65, "volatility": 0.2},
    "simulation": {"expected_delay": 3.5},
    "decision": {"balanced_route": "Route A"},
    "economic": {"recommended_route": "Route A"},
}

# ---------------- HEALTH CHECK ----------------
@app.get("/")
def home():
    return {"message": "Backend running 🚀"}

# ---------------- INIT ----------------
@app.get("/init")
def initialize():
    return {
        "status": "initialized",
        "state": GLOBAL_STATE
    }

# ---------------- COPILOT API ----------------
@app.post("/copilot")
def copilot(req: CopilotRequest):
    try:
        # 🔥 CHECK API KEY BEFORE CALLING LLM
        if not os.getenv("GEMINI_API_KEY"):
            return {
                "response": "LLM not configured. Please set GEMINI_API_KEY.",
                "mode": "error",
                "confidence": 0.0,
            }

        result = run_copilot(
            user_query=req.query,
            intelligence_state=GLOBAL_STATE.get("intelligence", {}),
            simulation_output=GLOBAL_STATE.get("simulation", {}),
            game_theory_output={},
            decision_output=GLOBAL_STATE.get("decision", {}),
            economic_output=GLOBAL_STATE.get("economic", {}),
        )

        return result

    except Exception as e:
        return {
            "response": f"Error generating response: {str(e)}",
            "mode": "error",
            "confidence": 0.0,
        }