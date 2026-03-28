"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function CopilotWidget() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ✅ Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendQuery = async () => {
    if (!query.trim()) return;

    const currentQuery = query; // ✅ FIX (important)
    const userMessage: Message = { role: "user", content: currentQuery };

    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: currentQuery }),
      });

      // ✅ Handle backend not running
      if (!res.ok) {
        throw new Error("Server error");
      }

      const data = await res.json();

      const botMessage: Message = {
        role: "assistant",
        content:
          data?.response ||
          "⚠️ Copilot returned empty response",
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error(err);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ Backend not reachable.\nMake sure FastAPI is running on port 8000.",
        },
      ]);
    }

    setLoading(false);
  };

  return (
    <>
      {/* ✅ Floating Button (FIXED POSITION) */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-24 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition"
      >
        💬
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-28 right-6 w-[360px] h-[500px] bg-[#0b1220] border border-blue-500/30 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-blue-500/20 flex justify-between items-center">
            <span className="text-white font-semibold">
              🤖 AI Copilot
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm scrollbar-thin scrollbar-thumb-blue-500/30">
            {messages.length === 0 && (
              <div className="text-gray-400 text-center mt-10">
                Ask about risk, routes, or delays...
              </div>
            )}

            {messages.map((msg, index) => (
              <div
                key={index}
                className={`max-w-[80%] px-3 py-2 rounded-lg whitespace-pre-line ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white ml-auto"
                    : "bg-gray-800 text-gray-100"
                }`}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div className="text-gray-400 text-xs">
                🤖 Thinking...
              </div>
            )}

            {/* Auto-scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-blue-500/20 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && sendQuery()
              }
              placeholder="Ask anything..."
              className="flex-1 bg-[#111827] text-white px-3 py-2 rounded-lg outline-none border border-gray-700 focus:border-blue-500"
            />

            <button
              onClick={sendQuery}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}