import os
from datetime import datetime, timezone

import google.generativeai as genai

from copilot.context_builder import build_context
from copilot.memory import update_memory, chat_history
from copilot.mode_detector import detect_mode


def run_copilot(
    user_query: str,
    intelligence_state: dict,
    simulation_output: dict,
    game_theory_output: dict,
    decision_output: dict,
    economic_output: dict,
) -> dict:

    # -----------------------------
    # 1. Build compact context
    # -----------------------------
    system_data = {
        "intelligence_state": intelligence_state or {},
        "simulation": simulation_output or {},
        "decision": decision_output or {},
        "economic": economic_output or {},
    }

    context = build_context(system_data)

    # -----------------------------
    # 2. Detect mode
    # -----------------------------
    mode = detect_mode(user_query or "")

    # -----------------------------
    # 3. Update chat history
    # -----------------------------
    update_memory("user", user_query)

    # -----------------------------
    # 4. DOMAIN FALLBACK (IMPORTANT 🔥)
    # -----------------------------
    def domain_fallback():
        risk = context.get("risk", "unknown")
        delay = context.get("delay", "unknown")
        route = context.get("best_route", "not available")

        return f"""
Insight:
Current supply chain risk is {risk} with expected delay of {delay} days.

Recommendation:
Use the optimal route: {route} and monitor disruptions closely.

Reasoning:
Decision is based on simulated delay, aggregated risk, and route optimization outputs.
"""

    # -----------------------------
    # 5. Prompt
    # -----------------------------
    prompt = f"""
You are a Supply Chain AI Copilot.

STRICT:
- Only use given data
- No assumptions
- If missing → say "insufficient data"

MODE: {mode}

CONTEXT:
{context}

QUESTION:
{user_query}

Answer:
Insight:
Recommendation:
Reasoning:
"""

    # -----------------------------
    # 6. Gemini Call (SAFE)
    # -----------------------------
    api_key = os.getenv("GEMINI_API_KEY")

    text = None

    if api_key:
        try:
            genai.configure(api_key=api_key)

            # 🔥 USE MOST COMPATIBLE MODEL
            model = genai.GenerativeModel("models/gemini-1.5-flash")

            response = model.generate_content(prompt)

            text = getattr(response, "text", None)

        except Exception as e:
            print("Gemini Error:", e)

    # -----------------------------
    # 7. FINAL FALLBACK (NEVER FAIL)
    # -----------------------------
    if not text or len(text.strip()) == 0:
        text = domain_fallback()

    text = text[:800]

    update_memory("assistant", text)

    # -----------------------------
    # 8. Confidence
    # -----------------------------
    confidence = 0.85 if "Insight" in text else 0.5

    return {
        "response": text,
        "mode": mode,
        "confidence": confidence,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }