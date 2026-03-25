/**
 * Assessment Chat Panel
 *
 * Floating chat UI for asking questions about the assessment.
 * Opens from a FAB at bottom-right. Shows context-aware mock
 * conversation with AI assistant.
 */
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Mock responses based on keywords
// ---------------------------------------------------------------------------

const MOCK_RESPONSES: Array<{ keywords: string[]; response: string }> = [
  {
    keywords: ['risk', 'blocker', 'critical'],
    response: 'Based on the assessment, there are 3 critical blockers:\n\n1. **QCP Calculator Plugins** — 3 plugins totaling ~4,200 LOC require full rewrite. These use external callouts that cannot be mapped to declarative Pricing Procedures.\n\n2. **MDQ (Multi-Dimensional Quoting)** — Used by 23 products with only partial RCA parity. This may require custom development or scope reduction.\n\n3. **RCA Licenses** — Not detected in your org. Deployment cannot begin until licenses are procured.\n\nI recommend addressing license procurement immediately as it has the longest lead time.',
  },
  {
    keywords: ['pricing', 'price rule', 'discount'],
    response: 'The Pricing domain has **243 rules** — the largest domain by item count. Here\'s the breakdown:\n\n- **82 rules (34%)** can be auto-migrated to Pricing Procedures\n- **100 rules (41%)** need guided setup with manual configuration\n- **58 rules (24%)** require custom development\n- **3 rules** are blocked\n\nThe 47 high-complexity rules drive 78% of the estimated pricing migration effort. I\'d recommend starting with the 82 auto-mappable rules to build momentum.',
  },
  {
    keywords: ['timeline', 'effort', 'how long', 'estimate'],
    response: 'Based on the complexity analysis, I recommend a **3-phase approach**:\n\n- **Phase 1** (8-12 weeks): Core — Products + Pricing migration\n- **Phase 2** (6-10 weeks): Extensions — Rules + Custom Code rewrite\n- **Phase 3** (4-6 weeks): Integrations + Cutover\n\nTotal estimated timeline: **18-28 weeks**. The primary risk to timeline is the QCP rewrite (4,200 LOC) and the 12 integrations that reference CPQ objects directly.',
  },
  {
    keywords: ['product', 'bundle', 'catalog'],
    response: 'The Products domain contains **187 items** with moderate complexity:\n\n- **120 (64%)** auto-mappable to Product Selling Models\n- **45 (24%)** need guided setup\n- **18 (10%)** require custom development\n- **4 items** are blocked\n\nNotable findings: 4 bundles have nesting depth > 3 levels (needs restructuring), 12 QLE customizations all require manual rebuild, and 18 twin field pairs need Flow-based recreation.',
  },
  {
    keywords: ['report', 'dashboard', 'data'],
    response: 'There are **85 reports and 12 dashboards** that reference CPQ objects — all will break post-migration. However:\n\n- **10 reports** are actively used (last run < 7 days)\n- **2 reports** are moderately used (8-30 days)\n- **15 reports** are stale (30+ days, including QLE Usage Metrics at 60 days)\n\nI recommend rebuilding only the actively-used reports first and deferring stale ones. This reduces the report migration effort by ~80%.',
  },
];

function getAIResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  for (const { keywords, response } of MOCK_RESPONSES) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return response;
    }
  }
  return 'I can help you understand your CPQ migration assessment. Try asking about:\n\n- **Critical risks and blockers**\n- **Pricing rules analysis**\n- **Timeline and effort estimates**\n- **Product catalog complexity**\n- **Reports and dashboards impact**\n\nWhat would you like to know?';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatStub() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi! I\'m your assessment assistant. I can answer questions about this CPQ migration analysis — risks, complexity, timeline, or any domain. What would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: getAIResponse(trimmed),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 800 + Math.random() * 600);
  };

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-20 end-6 z-9999 w-96 h-130 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          data-testid="chat-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                <Sparkles size={14} className="text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Assessment Assistant</p>
                <p className="text-[10px] text-emerald-600">Online</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-md'
                      : 'bg-slate-100 text-slate-800 rounded-bl-md'
                  }`}
                >
                  {msg.content.split('\n').map((line, i) => {
                    // Basic markdown: **bold**
                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
                        {parts.map((part, j) =>
                          part.startsWith('**') && part.endsWith('**') ? (
                            <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                          ) : (
                            <span key={j}>{part}</span>
                          ),
                        )}
                      </p>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-slate-100 bg-white">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="Ask about the assessment..."
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:bg-white"
                aria-label="Chat message"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <div className="fixed bottom-6 end-6 z-9998" data-testid="chat-stub">
        <button
          onClick={() => setOpen(!open)}
          className={`relative w-12 h-12 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center ${
            open ? 'bg-slate-700 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'
          }`}
          aria-label={open ? 'Close chat' : 'Open AI Chat Assistant'}
        >
          {open ? <X size={20} /> : <MessageCircle size={20} />}
          {!open && (
            <span className="absolute -top-0.5 -end-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
          )}
        </button>
      </div>
    </>
  );
}
