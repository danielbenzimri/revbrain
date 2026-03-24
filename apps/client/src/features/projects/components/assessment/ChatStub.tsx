/**
 * Chat UI Stub
 *
 * Reserved 48px strip on the trailing edge with a chat bubble icon
 * and "Coming Soon" tooltip. The main content must work at both
 * full width and with ~320px removed (for when chat is built).
 */
import { MessageCircle } from 'lucide-react';

export default function ChatStub() {
  return (
    <div
      className="fixed inset-y-0 end-0 w-12 z-40 flex flex-col items-center justify-center"
      data-testid="chat-stub"
    >
      <button
        className="group relative w-10 h-10 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:shadow-xl transition-all flex items-center justify-center"
        aria-label="AI Chat Assistant — Coming Soon"
        title="AI Chat Assistant — Coming Soon"
      >
        <MessageCircle size={18} />
        {/* Pulse dot */}
        <span className="absolute -top-0.5 -end-0.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
      </button>
    </div>
  );
}
