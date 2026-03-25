/**
 * Chat UI Stub
 *
 * Floating action button at bottom-right for future AI chat.
 * Positioned to avoid overlapping content.
 */
import { MessageCircle } from 'lucide-react';

export default function ChatStub() {
  return (
    <div
      className="fixed bottom-6 end-6 z-40"
      data-testid="chat-stub"
    >
      <button
        className="group relative w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        aria-label="AI Chat Assistant — Coming Soon"
        title="AI Chat Assistant — Coming Soon"
      >
        <MessageCircle size={20} />
        <span className="absolute -top-0.5 -end-0.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
      </button>
    </div>
  );
}
