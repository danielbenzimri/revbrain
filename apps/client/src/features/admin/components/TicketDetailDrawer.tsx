import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Loader2,
  Send,
  User,
  Building2,
  Clock,
  Tag,
  AlertCircle,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

import {
  useTicketDetail,
  useUpdateTicket,
  useAddTicketMessage,
  type TicketMessage,
  type TicketUpdateInput,
} from '../hooks';

interface TicketDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string | null;
  onUpdate?: () => void;
}

export function TicketDetailDrawer({
  open,
  onOpenChange,
  ticketId,
  onUpdate,
}: TicketDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const [replyContent, setReplyContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);

  const { data: ticket, isLoading, refetch } = useTicketDetail(ticketId);
  const updateTicket = useUpdateTicket();
  const addMessage = useAddTicketMessage();

  const handleClose = () => {
    setReplyContent('');
    setIsInternal(false);
    onOpenChange(false);
  };

  const handleStatusChange = async (status: string) => {
    if (!ticketId) return;
    try {
      await updateTicket.mutateAsync({
        id: ticketId,
        data: { status: status as TicketUpdateInput['status'] },
      });
      refetch();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update status', error);
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (!ticketId) return;
    try {
      await updateTicket.mutateAsync({
        id: ticketId,
        data: { priority: priority as TicketUpdateInput['priority'] },
      });
      refetch();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update priority', error);
    }
  };

  const handleSendReply = async () => {
    if (!ticketId || !replyContent.trim()) return;
    try {
      setIsSendingReply(true);
      await addMessage.mutateAsync({
        ticketId,
        data: {
          content: replyContent.trim(),
          isInternal,
        },
      });
      setReplyContent('');
      setIsInternal(false);
      refetch();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to send reply', error);
    } finally {
      setIsSendingReply(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-red-50 text-red-600 border-red-200';
      case 'in_progress':
        return 'bg-violet-50 text-violet-600 border-violet-200';
      case 'waiting_customer':
        return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'resolved':
        return 'bg-violet-50 text-violet-600 border-violet-200';
      case 'closed':
        return 'bg-slate-100 text-slate-500 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const formatStatus = (status: string) => {
    return t(`admin.support.status.${status}`, status.replace(/_/g, ' '));
  };

  const formatDate = (date: string) => {
    try {
      return format(new Date(date), 'MMM d, yyyy h:mm a');
    } catch {
      return date;
    }
  };

  const formatTimeAgo = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return date;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-xl p-0 flex flex-col bg-white"
        hideCloseButton
      >
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : !ticket ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <AlertCircle className="h-10 w-10 text-slate-300 mb-3" />
            <p>{t('admin.support.ticketNotFound')}</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="relative">
              <div className="h-1 bg-gradient-to-r from-violet-500 via-violet-400 to-cyan-400" />
              <div className="bg-gradient-to-b from-slate-50 to-white px-6 pt-5 pb-4 border-b border-slate-100">
                <button
                  onClick={handleClose}
                  className="absolute top-3 end-4 p-1.5 rounded-lg hover:bg-white/80 transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4.5 w-4.5" />
                </button>

                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded">
                        {ticket.ticketNumber}
                      </span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(ticket.status)}`}
                      >
                        {formatStatus(ticket.status)}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 truncate">{ticket.subject}</h2>
                    <p className="text-sm text-slate-500 mt-1">{formatTimeAgo(ticket.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Ticket Info */}
            <div className="px-6 py-4 border-b border-slate-100 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">{ticket.user?.fullName || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">{ticket.organization?.name || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">{ticket.category}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600">{formatDate(ticket.createdAt)}</span>
                </div>
              </div>

              {/* Status & Priority Controls */}
              <div className="flex gap-3 pt-2">
                <div className="flex-1">
                  <Label className="text-xs text-slate-500 mb-1 block">
                    {t('admin.support.table.status')}
                  </Label>
                  <Select
                    value={ticket.status}
                    onValueChange={handleStatusChange}
                    disabled={updateTicket.isPending}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">{t('admin.support.status.open')}</SelectItem>
                      <SelectItem value="in_progress">
                        {t('admin.support.status.in_progress')}
                      </SelectItem>
                      <SelectItem value="waiting_customer">
                        {t('admin.support.status.waiting_customer')}
                      </SelectItem>
                      <SelectItem value="resolved">{t('admin.support.status.resolved')}</SelectItem>
                      <SelectItem value="closed">{t('admin.support.status.closed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-slate-500 mb-1 block">
                    {t('admin.support.table.priority')}
                  </Label>
                  <Select
                    value={ticket.priority}
                    onValueChange={handlePriorityChange}
                    disabled={updateTicket.isPending}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('admin.support.priority.low')}</SelectItem>
                      <SelectItem value="medium">{t('admin.support.priority.medium')}</SelectItem>
                      <SelectItem value="high">{t('admin.support.priority.high')}</SelectItem>
                      <SelectItem value="urgent">{t('admin.support.priority.urgent')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('admin.support.conversation')}
              </h3>

              {ticket.messages.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>{t('admin.support.noMessages')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...ticket.messages].reverse().map((message: TicketMessage) => (
                    <div
                      key={message.id}
                      className={`rounded-lg p-3 ${
                        message.isInternal
                          ? 'bg-amber-50 border border-amber-200'
                          : message.senderType === 'admin'
                            ? 'bg-violet-50 border border-violet-100'
                            : message.senderType === 'system'
                              ? 'bg-slate-50 border border-slate-200'
                              : 'bg-white border border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              message.senderType === 'admin'
                                ? 'text-violet-700'
                                : message.senderType === 'system'
                                  ? 'text-slate-500'
                                  : 'text-slate-700'
                            }`}
                          >
                            {message.senderName}
                          </span>
                          {message.isInternal && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                              <Lock className="h-3 w-3" />
                              {t('admin.support.internalNote')}
                            </span>
                          )}
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              message.senderType === 'admin'
                                ? 'bg-violet-100 text-violet-600'
                                : message.senderType === 'system'
                                  ? 'bg-slate-200 text-slate-500'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {message.senderType}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {formatTimeAgo(message.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reply Box */}
            {ticket.status !== 'closed' && (
              <div className="border-t border-slate-100 px-6 py-4 space-y-3">
                <Textarea
                  placeholder={t('admin.support.replyPlaceholder')}
                  value={replyContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setReplyContent(e.target.value)
                  }
                  rows={3}
                  className="resize-none"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <Checkbox
                      checked={isInternal}
                      onCheckedChange={(checked: boolean | 'indeterminate') =>
                        setIsInternal(checked === true)
                      }
                    />
                    <Lock className="h-4 w-4 text-amber-500" />
                    {t('admin.support.markInternal')}
                  </label>
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyContent.trim() || isSendingReply}
                    className="gap-2"
                  >
                    {isSendingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {t('admin.support.sendReply')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
