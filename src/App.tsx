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
  const [documentId, setDocumentId] = useState<string | null>("default"); // Default PDF available
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{ filename: string; pageCount: number } | null>(null);

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
    return msg.id;
  }

  function updateMessage(id: string, contentOrUpdater: string | ((prev: string) => string)){
    setMessages((msgs) => 
      msgs.map((m) => 
        m.id === id
          ? {
              ...m,
              content: typeof contentOrUpdater === "function" 
              ? contentOrUpdater(m.content)
              : contentOrUpdater,
          }
        : m
      )
    );
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
        body: JSON.stringify({ message: trimmed, documentId, stream: false }), // Non-streaming by default (faster)
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status}). ${text}`.trim());
      }

      const contentType = res.headers.get("content-type") || "";
      
      if (contentType.includes("text/event-stream")) {
        // STREAMING MODE (shows progress, but slower)
        const assistantMsgId = addMessage("assistant", "");
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not readable");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6);
              if (jsonStr.trim() === "[DONE]") {
                setIsSending(false);
                return;
              }

              try {
                const data = JSON.parse(jsonStr);
                if (data.error) {
                  setError(data.error);
                  updateMessage(assistantMsgId, `Error: ${data.error}`);
                  setIsSending(false);
                  return;
                }
                if (data.token) {
                  updateMessage(assistantMsgId, (prev) => prev + data.token);
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e, jsonStr);
              }
            }
          }
        }
        setIsSending(false);
      } else {
        // NON-STREAMING MODE (faster, simpler)
        const data = (await res.json()) as { answer?: string };
        addMessage("assistant", data.answer ?? "No answer returned by server.");
        setIsSending(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addMessage("assistant", `Sorry — I hit an error talking to the server.\n\n${msg}`);
      setIsSending(false);
    }
  }

  function clearChat() {
    setError(null);
    setMessages([]);
    setInput("");
  }

  function removeDocument() {
    setDocumentId("default");
    setUploadedFileInfo(null);
    setSelectedFile(null);
    clearChat();
    setView("landing");
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

      const data = (await res.json()) as { documentId?: string; filename?: string; pageCount?: number };
      if (!data.documentId) throw new Error("Upload succeeded but no documentId returned.");

      // Debug: log response data
      console.log("Upload response:", data);
      console.log("Page count from server:", data.pageCount);

      setDocumentId(data.documentId);
      setUploadedFileInfo({
        filename: data.filename ?? selectedFile.name,
        pageCount: data.pageCount ?? 0,
      });
      setSelectedFile(null);
      setView("chat");
      clearChat();
      addMessage(
        "assistant",
        `Uploaded: ${data.filename ?? selectedFile.name} (${data.pageCount ?? 0} pages)\n\nAsk me anything about this PDF.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  }

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
                  A minimal RAG interface that answers using your PDF's content. Keep questions
                  specific for best results.
                </p>

                <div className="mt-8">
                  <div className="text-sm font-semibold">Upload your PDF</div>

                  {uploadError ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <span className="font-semibold">Upload error:</span> {uploadError}
                    </div>
                  ) : null}

                  {selectedFile && !isUploading && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      Selected: <span className="font-medium">{selectedFile.name}</span>
                    </div>
                  )}

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
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">Chat</div>
                    {uploadedFileInfo && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>📄 {uploadedFileInfo.filename}</span>
                        <span>·</span>
                        <span>{uploadedFileInfo.pageCount} page{uploadedFileInfo.pageCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadedFileInfo && (
                      <button
                        type="button"
                        onClick={removeDocument}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors duration-200 hover:bg-slate-50 active:translate-y-px motion-reduce:transition-none"
                      >
                        Remove & Reupload
                      </button>
                    )}
                    <div className="text-xs text-slate-500">
                      {isSending
                        ? "Thinking…"
                        : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
                    </div>
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