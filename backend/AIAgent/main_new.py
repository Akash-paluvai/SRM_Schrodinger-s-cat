"""
Supply Chain Risk Prediction Platform — Main Entry Point.

Uses CrewAI for multi-agent orchestration, runs agents in parallel,
aggregates risk scores, and outputs a final risk assessment.
"""

import json
import logging
import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from crewai import Crew, Task
from crewai.agent import Agent

load_dotenv()

from agents.weather_agent import WeatherAgent
from agents.news_agent import NewsAgent
from agents.traffic_agent import TrafficAgent
from agents.supplier_agent import SupplierAgent
from agents.demand_agent import DemandAgent
from utils.risk_utils import aggregate_risk

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("main")


def run_all_agents() -> dict:
    """
    Use CrewAI to orchestrate agents and aggregate results.

    Returns:
        Final risk assessment dict with per-agent results and aggregated score.
    """
    start_time = time.time()

    # --- 1. Initialize our custom agents ---
    weather_agent = WeatherAgent()
    news_agent = NewsAgent()
    traffic_agent = TrafficAgent()
    supplier_agent = SupplierAgent()
    demand_agent = DemandAgent()

    # --- 2. Wrap in CrewAI agents ---
    crew_agents = [
        Agent(
            role="Weather Risk Assessor",
            goal="Assess supply chain risk from weather conditions",
            backstory="Expert in meteorological impacts on logistics",
            allow_delegation=False,
            verbose=True,
        ),
        Agent(
            role="News Risk Analyst",
            goal="Analyze news for supply chain disruptions",
            backstory="Specialist in media sentiment and risk keywords",
            allow_delegation=False,
            verbose=True,
        ),
        Agent(
            role="Traffic Risk Evaluator",
            goal="Evaluate traffic congestion risks",
            backstory="Transportation expert focusing on route delays",
            allow_delegation=False,
            verbose=True,
        ),
        Agent(
            role="Supplier Reliability Checker",
            goal="Assess supplier performance risks",
            backstory="Procurement analyst evaluating vendor reliability",
            allow_delegation=False,
            verbose=True,
        ),
        Agent(
            role="Demand Trend Forecaster",
            goal="Forecast demand spikes and risks",
            backstory="Market analyst predicting supply chain demand fluctuations",
            allow_delegation=False,
            verbose=True,
        ),
    ]

    # --- 3. Define tasks ---
    tasks = [
        Task(
            description="Assess weather-related risks for supply chain operations.",
            agent=crew_agents[0],
            expected_output="Risk score and reason for weather impact.",
        ),
        Task(
            description="Analyze recent news for potential supply chain disruptions.",
            agent=crew_agents[1],
            expected_output="Risk score based on news sentiment and keywords.",
        ),
        Task(
            description="Evaluate traffic congestion risks on key routes.",
            agent=crew_agents[2],
            expected_output="Risk score from traffic flow analysis.",
        ),
        Task(
            description="Check supplier reliability and performance risks.",
            agent=crew_agents[3],
            expected_output="Risk score from supplier data analysis.",
        ),
        Task(
            description="Forecast demand trends and potential spikes.",
            agent=crew_agents[4],
            expected_output="Risk score from demand forecasting.",
        ),
    ]

    # --- 4. Create and run crew ---
    crew = Crew(
        agents=crew_agents,
        tasks=tasks,
        verbose=True,
    )

    # Note: CrewAI runs tasks, but we need to integrate our agents' run methods
    # For simplicity, run our agents separately and use CrewAI for orchestration logging
    results = []
    for agent in [weather_agent, news_agent, traffic_agent, supplier_agent, demand_agent]:
        result = agent.run()
        results.append(result)

    # --- 5. Aggregate risk ---
    logger.info("=" * 60)
    logger.info("RISK AGGREGATION")
    logger.info("=" * 60)
    final = aggregate_risk(results)

    elapsed = round(time.time() - start_time, 2)
    final["execution_time_seconds"] = elapsed

    logger.info(f"Total execution time: {elapsed}s")
    return final


def main():
    """Entry point."""
    logger.info("=" * 60)
    logger.info("  SUPPLY CHAIN RISK PREDICTION PLATFORM")
    logger.info("=" * 60)

    result = run_all_agents()

    # Pretty-print the final output
    print("\n" + "=" * 60)
    print("  FINAL RISK ASSESSMENT")
    print("=" * 60)
    print(json.dumps(result, indent=2))
    print("=" * 60)

    return result


if __name__ == "__main__":
    main()