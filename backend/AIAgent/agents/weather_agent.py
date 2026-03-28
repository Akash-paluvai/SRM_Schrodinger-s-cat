"""
WeatherAgent — Assesses supply chain risk based on current weather conditions.
Data source: OpenWeatherMap API.
Uses LangChain and LLM for sophisticated risk analysis.
"""

from agents.base_agent import BaseAgent
from services.api_clients import fetch_weather
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate

import os

# Default coordinates: Mumbai, India (major supply chain hub)
DEFAULT_LAT = 19.076
DEFAULT_LON = 72.8777


class WeatherAgent(BaseAgent):
    """Evaluates weather-related supply chain risk using LLM analysis."""

    def __init__(self, lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON):
        super().__init__()
        self.name = "weather"
        self.tools = ["OpenWeatherMap API", "LangChain LLM"]
        self.lat = lat
        self.lon = lon
        self.llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1, google_api_key=os.getenv("GEMINI_API_KEY"))

    def fetch_data(self) -> dict | None:
        """Fetch current weather for the configured coordinates."""
        return fetch_weather(self.lat, self.lon)

    def process(self, data: dict) -> dict:
        """Extract weather details for LLM analysis."""
        weather_list = data.get("weather", [])
        main_condition = weather_list[0].get("main", "Clear") if weather_list else "Clear"
        description = weather_list[0].get("description", "") if weather_list else ""
        temp = data.get("main", {}).get("temp", 25)
        wind_speed = data.get("wind", {}).get("speed", 0)
        humidity = data.get("main", {}).get("humidity", 50)
        city = data.get("name", "Unknown")

        return {
            "condition": main_condition,
            "description": description,
            "temp": temp,
            "wind_speed": wind_speed,
            "humidity": humidity,
            "city": city,
        }

    def compute_risk(self, processed: dict) -> tuple[float, str, float]:
        """
        Use LLM to analyze weather impact on supply chain and compute risk.

        Algorithm: Prompt LLM with weather data to assess disruption risk.
        """
        prompt = PromptTemplate(
            input_variables=["condition", "description", "temp", "wind", "humidity", "city"],
            template="""
            Analyze the following weather conditions for potential supply chain disruptions in {city}:
            - Condition: {condition} ({description})
            - Temperature: {temp}°C
            - Wind Speed: {wind} m/s
            - Humidity: {humidity}%

            Rate the risk to supply chain operations on a scale of 0-100, where:
            - 0-20: Minimal impact
            - 21-50: Moderate delays possible
            - 51-80: Significant disruptions
            - 81-100: Severe risks (e.g., shutdowns, damage)

            Provide a risk score (number only) and a brief reason.
            Format: Score: X, Reason: Y
            """
        )

        chain = prompt | self.llm
        response = chain.invoke({
            "condition": processed["condition"],
            "description": processed["description"],
            "temp": processed["temp"],
            "wind": processed["wind_speed"],
            "humidity": processed["humidity"],
            "city": processed["city"]
        })

        # Parse response (response is AIMessage)
        response_text = response.content if hasattr(response, 'content') else str(response)
        try:
            score_part = response_text.split("Score:")[1].split(",")[0].strip()
            reason_part = response_text.split("Reason:")[1].strip()
            risk_score = float(score_part)
            reason = reason_part
        except:
            risk_score = 25.0
            reason = "LLM analysis failed, using default"

        confidence = 0.9
        return risk_score, reason, confidence
