"""
WeatherAgent — Assesses supply chain risk based on current weather conditions.
Data source: OpenWeatherMap API.
Uses OpenRouter LLM (via direct HTTP) for risk analysis.
"""

import os
import requests

from agents.base_agent import BaseAgent
from services.api_clients import fetch_weather

# Default coordinates: Mumbai, India (major supply chain hub)
DEFAULT_LAT = 19.076
DEFAULT_LON = 72.8777

OPENROUTER_URL   = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "mistralai/mistral-7b-instruct")


def _call_openrouter(prompt: str) -> str:
    """
    Call the OpenRouter chat completions API.
    Returns the assistant's response text, or raises on failure.
    """
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is not set in environment")

    resp = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
            "HTTP-Referer":  "https://srm-schrodinger.local",   # required by OpenRouter
            "X-Title":       "SRM Supply Chain Intelligence",
        },
        json={
            "model":       OPENROUTER_MODEL,
            "messages":    [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens":  200,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


class WeatherAgent(BaseAgent):
    """Evaluates weather-related supply chain risk using OpenRouter LLM analysis."""

    def __init__(self, lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON):
        super().__init__()
        self.name  = "weather"
        self.tools = ["OpenWeatherMap API", "OpenRouter LLM"]
        self.lat   = lat
        self.lon   = lon

    def fetch_data(self) -> dict | None:
        """Fetch current weather for the configured coordinates."""
        return fetch_weather(self.lat, self.lon)

    def process(self, data: dict) -> dict:
        """Extract weather details for LLM analysis."""
        weather_list    = data.get("weather", [])
        main_condition  = weather_list[0].get("main",        "Clear") if weather_list else "Clear"
        description     = weather_list[0].get("description", "")      if weather_list else ""
        temp            = data.get("main",  {}).get("temp",     25)
        wind_speed      = data.get("wind",  {}).get("speed",     0)
        humidity        = data.get("main",  {}).get("humidity", 50)
        city            = data.get("name",  "Unknown")

        return {
            "condition":   main_condition,
            "description": description,
            "temp":        temp,
            "wind_speed":  wind_speed,
            "humidity":    humidity,
            "city":        city,
        }

    def compute_risk(self, processed: dict) -> tuple[float, str, float]:
        """
        Use OpenRouter LLM to analyze weather impact on supply chain.
        Falls back to rule-based scoring if the API call fails.
        """
        prompt = (
            f"Analyze these weather conditions for supply chain disruption risk in {processed['city']}:\n"
            f"- Condition: {processed['condition']} ({processed['description']})\n"
            f"- Temperature: {processed['temp']}°C\n"
            f"- Wind Speed: {processed['wind_speed']} m/s\n"
            f"- Humidity: {processed['humidity']}%\n\n"
            f"Rate the risk on 0-100 (0-20 minimal, 21-50 moderate, 51-80 significant, 81-100 severe).\n"
            f"Reply in exactly this format — one line only:\n"
            f"Score: <number>, Reason: <one sentence>"
        )

        try:
            response_text = _call_openrouter(prompt)
            score_str  = response_text.split("Score:")[1].split(",")[0].strip()
            reason_str = response_text.split("Reason:")[1].strip()
            risk_score = float(score_str)
            reason     = reason_str
        except Exception as exc:
            self.logger.warning("OpenRouter call failed (%s) — using rule-based fallback", exc)
            risk_score, reason = _rule_based_risk(processed)

        # Store the LLM insight back so frontend can display it
        processed["llm_insight"] = reason

        return risk_score, reason, 0.9


def _rule_based_risk(p: dict) -> tuple[float, str]:
    """
    Simple rule-based fallback when the LLM is unavailable.
    Maps condition + wind + humidity to a risk score.
    """
    HIGH_RISK = {"Thunderstorm", "Tornado", "Hurricane", "Typhoon"}
    MED_RISK  = {"Rain", "Snow", "Blizzard", "Drizzle", "Squall"}

    base = 20.0
    if p["condition"] in HIGH_RISK:
        base = 80.0
    elif p["condition"] in MED_RISK:
        base = 50.0
    elif p["condition"] in {"Mist", "Fog", "Haze", "Smoke"}:
        base = 35.0

    if p["wind_speed"] > 15:
        base = min(base + 15, 100)
    elif p["wind_speed"] > 8:
        base = min(base + 8, 100)

    if p["humidity"] > 90:
        base = min(base + 5, 100)

    reason = (
        f"{p['condition']} ({p['description']}) at {p['temp']}°C, "
        f"wind {p['wind_speed']} m/s, humidity {p['humidity']}% — "
        f"{'high' if base >= 70 else 'moderate' if base >= 40 else 'low'} disruption risk."
    )
    return round(base, 1), reason
