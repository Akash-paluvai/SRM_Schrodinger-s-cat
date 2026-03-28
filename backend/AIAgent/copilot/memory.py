MAX_HISTORY = 6

chat_history = []

def update_memory(role: str, content: str):
    global chat_history

    chat_history.append({"role": role, "content": content})

    # keep last N
    if len(chat_history) > MAX_HISTORY:
        chat_history = chat_history[-MAX_HISTORY:]

    return chat_history