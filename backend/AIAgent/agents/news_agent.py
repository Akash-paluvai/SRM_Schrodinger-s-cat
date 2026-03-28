"""
NewsAgent — Assesses supply chain risk based on recent news sentiment.
Data source: NewsAPI.
Uses transformers for NLP sentiment analysis and risk classification.
"""

from agents.base_agent import BaseAgent
from services.api_clients import fetch_news
from transformers import pipeline
import re

# Keywords that signal supply chain disruption
RISK_KEYWORDS = [
    "war", "conflict", "strike", "blockade", "sanction", "protest",
    "shortage", "disruption", "embargo", "tariff", "shutdown", "delay",
    "port closure", "cyber attack", "pandemic", "flood", "earthquake",
]


class NewsAgent(BaseAgent):
    """Evaluates news-based supply chain risk using NLP sentiment analysis."""

    def __init__(self, query: str = "supply chain OR shipping OR logistics"):
        super().__init__()
        self.name = "news"
        self.tools = ["NewsAPI", "Transformers NLP"]
        self.query = query
        self.sentiment_analyzer = pipeline("sentiment-analysis", model="cardiffnlp/twitter-roberta-base-sentiment-latest")

    def fetch_data(self) -> dict | None:
        """Fetch recent news articles matching the query."""
        return fetch_news(self.query)

    def process(self, data: dict) -> dict:
        """Extract and analyze sentiment from titles and descriptions."""
        articles = data.get("articles", [])
        sentiments = []
        risk_keywords_found = []

        for article in articles:
            title = article.get("title", "") or ""
            description = article.get("description", "") or ""
            text = f"{title} {description}"

            # Sentiment analysis
            sentiment_result = self.sentiment_analyzer(text[:512])  # Limit to model input size
            sentiment = sentiment_result[0]['label'] if sentiment_result else 'NEUTRAL'
            sentiments.append(sentiment)

            # Keyword extraction
            text_lower = text.lower()
            found_keywords = [kw for kw in RISK_KEYWORDS if re.search(r'\b' + re.escape(kw) + r'\b', text_lower)]
            risk_keywords_found.extend(found_keywords)

        # Aggregate sentiment
        sentiment_counts = {'LABEL_0': 0, 'LABEL_1': 0, 'LABEL_2': 0}  # Negative, Neutral, Positive
        for sent in sentiments:
            if sent in sentiment_counts:
                sentiment_counts[sent] += 1

        overall_sentiment = max(sentiment_counts, key=sentiment_counts.get)

        return {
            "article_count": len(articles),
            "sentiments": sentiments,
            "overall_sentiment": overall_sentiment,
            "risk_keywords": list(set(risk_keywords_found)),
            "keyword_count": len(risk_keywords_found),
        }

    def compute_risk(self, processed: dict) -> tuple[float, str, float]:
        """
        Compute risk using sentiment and keyword analysis.

        Algorithm: Combine sentiment score with keyword frequency.
        Negative sentiment + keywords increase risk.
        """
        sentiment_score = {'LABEL_0': 80, 'LABEL_1': 30, 'LABEL_2': 10}.get(processed["overall_sentiment"], 30)
        keyword_penalty = min(50, processed["keyword_count"] * 10)
        risk_score = min(100, sentiment_score + keyword_penalty)

        reason = (
            f"Overall sentiment: {processed['overall_sentiment']} across "
            f"{processed['article_count']} articles. "
            f"Risk keywords: {', '.join(processed['risk_keywords'][:5])} "
            f"(total: {processed['keyword_count']})"
        )

        confidence = min(0.95, 0.5 + (processed["article_count"] / 50))
        return risk_score, reason, confidence
