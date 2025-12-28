import { useEffect, useMemo, useRef, useState } from "react";

function App() {
  type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
  };

  const apiBaseUrl =
    (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";
  const askUrl = useMemo(() => new URL("/ask", apiBaseUrl).toString(), [apiBaseUrl]);
  const uploadUrl = useMemo(() => new URL("/upload", apiBaseUrl).toString(), [apiBaseUrl]);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"landing" | "chat">("landing");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isSending]);

  function addMessage(role: ChatMessage["role"], content: string) {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      content,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, msg]);
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setError(null);
    addMessage("user", trimmed);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch(askUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, documentId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status}). ${text}`.trim());
      }

      const data = (await res.json()) as { answer?: string };
      addMessage("assistant", data.answer ?? "No answer returned by server.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addMessage("assistant", `Sorry — I hit an error talking to the server.\n\n${msg}`);
    } finally {
      setIsSending(false);
    }
  }

  function clearChat() {
    setError(null);
    setMessages([]);
    setInput("");
  }

  async function uploadPdf() {
    if (!selectedFile || isUploading) return;
    setUploadError(null);
    setIsUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", selectedFile);

      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}). ${text}`.trim());
      }

      const data = (await res.json()) as { documentId?: string; filename?: string };
      if (!data.documentId) throw new Error("Upload succeeded but no documentId returned.");

      setDocumentId(data.documentId);
      setView("chat");
      clearChat();
      addMessage(
        "assistant",
        `Uploaded: ${data.filename ?? selectedFile.name}\n\nAsk me anything about this PDF.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  }

  const quickPrompts = [
    "Summarize the document in 5 bullet points.",
    "What are the key definitions mentioned?",
    "Give me a short glossary of important terms.",
  ];

  const panelBase =
    "absolute inset-0 transition-all duration-300 ease-out motion-reduce:transition-none";
  const panelActive = "opacity-100 translate-y-0";
  const panelInactive = "pointer-events-none opacity-0 translate-y-2";

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-lg">📄</span>
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">PDF RAG Chatbot</div>
              <div className="text-xs text-slate-500">Ask questions. Get answers from your PDF.</div>
            </div>
          </div>

          <div className="relative h-10">
            <div
              className={[
                "absolute right-0 top-0 flex items-center gap-2 transition-all duration-200 ease-out motion-reduce:transition-none",
                view === "chat" ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1",
              ].join(" ")}
              aria-hidden={view !== "chat"}
            >
              <button
                type="button"
                onClick={() => setView("landing")}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50 active:translate-y-px motion-reduce:transition-none"
              >
                Home
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50 active:translate-y-px motion-reduce:transition-none"
              >
                Clear
              </button>
            </div>

            <div
              className={[
                "absolute right-0 top-0 transition-all duration-200 ease-out motion-reduce:transition-none",
                view === "landing"
                  ? "opacity-100 translate-y-0"
                  : "pointer-events-none opacity-0 -translate-y-1",
              ].join(" ")}
              aria-hidden={view !== "landing"}
            >
              <button
                type="button"
                onClick={() => setView("chat")}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-slate-800 active:translate-y-px motion-reduce:transition-none"
              >
                Start
              </button>
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Landing */}
          <main
            className={[panelBase, view === "landing" ? panelActive : panelInactive].join(" ")}
            aria-hidden={view !== "landing"}
          >
            <div className="flex h-full flex-col justify-center overflow-y-auto py-8">
              <div className="rounded-2xl border border-slate-200 bg-white p-8">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Chat with your document.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                  A minimal RAG interface that answers using your PDF’s content. Keep questions
                  specific for best results.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {quickPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setInput(p);
                        setView("chat");
                      }}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors duration-200 hover:bg-slate-50 active:translate-y-px motion-reduce:transition-none"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="mt-8">
                  <div className="text-sm font-semibold">Upload your PDF</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Your PDF is kept in memory only (lost when the server restarts).
                  </div>

                  {uploadError ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <span className="font-semibold">Upload error:</span> {uploadError}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border file:border-slate-200 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 file:transition-colors file:duration-200 hover:file:bg-slate-50 motion-reduce:file:transition-none"
                    />
                    <button
                      type="button"
                      onClick={() => void uploadPdf()}
                      disabled={!selectedFile || isUploading}
                      className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-slate-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                    >
                      {isUploading ? "Uploading…" : "Upload"}
                    </button>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setView("chat")}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-slate-800 active:translate-y-px motion-reduce:transition-none"
                  >
                    Start chatting
                  </button>
                  <div className="text-xs text-slate-500">
                    Backend: <span className="font-mono">{apiBaseUrl}</span>
                    {documentId ? (
                      <>
                        {" "}
                        · Doc: <span className="font-mono">{documentId}</span>
                      </>
                    ) : (
                      <> · Doc: <span className="font-mono">default</span></>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* Chat */}
          <main
            className={[panelBase, view === "chat" ? panelActive : panelInactive].join(" ")}
            aria-hidden={view !== "chat"}
          >
            <div className="flex h-full flex-col overflow-y-auto py-8">
              <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="text-sm font-medium">Chat</div>
                  <div className="text-xs text-slate-500">
                    {isSending
                      ? "Thinking…"
                      : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {messages.length === 0 ? (
                    <div className="py-10 text-sm text-slate-600">
                      Ask a question to begin. Press{" "}
                      <span className="font-mono">Enter</span> to send.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((m) => {
                        const isUser = m.role === "user";
                        return (
                          <div
                            key={m.id}
                            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={[
                                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                                "transition-transform duration-200 ease-out motion-reduce:transition-none",
                                isUser
                                  ? "bg-slate-900 text-white"
                                  : "border border-slate-200 bg-slate-50 text-slate-900",
                              ].join(" ")}
                            >
                              {m.content}
                            </div>
                          </div>
                        );
                      })}

                      {isSending ? (
                        <div className="flex justify-start">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                            Thinking…
                          </div>
                        </div>
                      ) : null}

                      <div ref={scrollRef} />
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 p-4">
                  {error ? (
                    <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <span className="font-semibold">Error:</span> {error}
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder="Ask a question…"
                      className="min-h-[44px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-slate-300 motion-reduce:transition-none"
                    />
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={isSending || input.trim().length === 0}
                      className="inline-flex h-[44px] items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-slate-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                    >
                      Send
                    </button>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500">
                    API endpoint: <span className="font-mono">{askUrl}</span> · Doc:{" "}
                    <span className="font-mono">{documentId ?? "default"}</span>
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );

}

export default App;