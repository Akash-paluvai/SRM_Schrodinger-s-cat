def detect_mode(query: str) -> str:
    q = query.lower()

    if "why" in q:
        return "explain"
    elif "compare" in q:
        return "compare"
    elif "what if" in q:
        return "simulate"
    elif "best" in q:
        return "recommend"
    else:
        return "general"