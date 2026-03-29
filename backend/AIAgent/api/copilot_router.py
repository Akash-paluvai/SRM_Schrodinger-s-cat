from fastapi import APIRouter
from pydantic import BaseModel
import os

from copilot.copilot_engine import run_copilot

router = APIRouter()

class CopilotRequest(BaseModel):
    query: str

@router.post("/copilot", summary="Supply Chain Copilot Chat")
async def copilot_chat(req: CopilotRequest):
    # Retrieve Gemini API Key
    if not os.getenv("GEMINI_API_KEY"):
        return {
            "response": "⚠️ LLM not configured. Please set GEMINI_API_KEY in backend/AIAgent/.env.",
            "mode": "error",
            "confidence": 0.0,
        }
        
    try:
        # Run copilot engine. If the frontend doesn't pass state, use defaults.
        # Future enhancement: Pass frontend's intelligence/simulation state in request body.
        result = run_copilot(
            user_query=req.query,
            intelligence_state={},
            simulation_output={},
            game_theory_output={},
            decision_output={},
            economic_output={},
        )
        return result
    except Exception as e:
        return {
            "response": f"⚠️ Copilot logic error: {str(e)}",
            "mode": "error",
            "confidence": 0.0,
        }
