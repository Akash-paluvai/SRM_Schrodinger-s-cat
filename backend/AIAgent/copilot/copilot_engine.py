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

STRICT DOMAIN CONSTRAINTS:
- You ONLY answer questions related to Supply Chain, Logistics, Trade, Routing, Risk, Weather, and Operations.
- If the user asks a general knowledge question (e.g. "What is the capital of France?", "Write a poem", "Who won the World Cup?"), you MUST refuse and politely explain you are a dedicated Supply Chain AI.
- Only use given data. If you lack data for a supply chain question, say "insufficient data".
- No assumptions.

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

            # Dynamically pull the exact models this API key / SDK version actually supports!
            available_models = []
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    available_models.append(m.name)
                    
            if not available_models:
                raise Exception("This Google API Key has no generateContent models enabled.")
                
            # Prefer 'flash' for speed, otherwise just grab the first valid text model
            target_model = next((m for m in available_models if 'flash' in m.lower()), available_models[0])
            
            model = genai.GenerativeModel(target_model)
            response = model.generate_content(prompt)

            text = getattr(response, "text", None)

        except Exception as e:
            print("Gemini Error:", e)
            avail = available_models if 'available_models' in locals() else 'Unknown'
            text = f"LLM Connection Error: {str(e)}\n\n(Available: {avail})"

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