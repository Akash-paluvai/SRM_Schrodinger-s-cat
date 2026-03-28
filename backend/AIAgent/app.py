from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from copilot.copilot_engine import run_copilot
from agents.weather_agent import WeatherAgent
from agents.news_agent import NewsAgent
from agents.traffic_agent import TrafficAgent
from agents.supplier_agent import SupplierAgent
from agents.demand_agent import DemandAgent
from utils.risk_utils import aggregate_risk

app = FastAPI()

# ---------------- GLOBAL STATE ----------------
GLOBAL_STATE = {
    "intelligence": {},
    "simulation": {},
    "decision": {},
    "economic": {},
}

# ---------------- REQUEST MODEL ----------------
class CopilotRequest(BaseModel):
    query: str

# ---------------- STEP 1 ----------------
def run_all_agents():
    agents = [
        WeatherAgent(),
        NewsAgent(),
        TrafficAgent(),
        SupplierAgent(),
        DemandAgent(),
    ]

    results = []
    for agent in agents:
        try:
            results.append(agent.run())
        except:
            results.append({
                "agent": agent.name,
                "risk_score": 30,
                "confidence": 0.2,
            })

    final = aggregate_risk(results)
    GLOBAL_STATE["intelligence"] = final
    return final

# ---------------- INIT API ----------------
@app.get("/init")
def init():
    data = run_all_agents()

    GLOBAL_STATE["simulation"] = {}
    GLOBAL_STATE["decision"] = {}
    GLOBAL_STATE["economic"] = {}

    return {"status": "ready", "data": data}

# ---------------- COPILOT API ----------------
@app.post("/copilot")
def copilot(req: CopilotRequest):
    return run_copilot(
        user_query=req.query,
        intelligence_state=GLOBAL_STATE["intelligence"],
        simulation_output=GLOBAL_STATE["simulation"],
        game_theory_output={},
        decision_output=GLOBAL_STATE["decision"],
        economic_output=GLOBAL_STATE["economic"],
    )

# ---------------- HEALTH CHECK ----------------
@app.get("/")
def home():
    return {"msg": "Backend running"}