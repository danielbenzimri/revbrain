import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Users, Mail, Clock, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';

interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isOrgAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  activatedAt: string | null;
  lastLoginAt: string | null;
}

/**
 * Role display names
 */
const ROLE_LABELS: Record<string, string> = {
  system_admin: 'System Admin',
  org_owner: 'Organization Owner',
  admin: 'Admin',
  operator: 'Operator',
  reviewer: 'Reviewer',
};

/**
 * TeamPage
 *
 * Displays all users in the current user's organization.
 * Org admins can invite new users from here.
 */
export default function TeamPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user can invite
  const canInvite = user?.role === 'org_owner' || user?.role === 'org_owner';

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        const session = await (await import('@/lib/services')).getAuthAdapter().getSession();

        const response = await fetch(`${apiUrl}/v1/org/users`, {
          headers: {
            Authorization: `Bearer ${session?.accessToken}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to fetch team members');
        }

        setMembers(data.data);
      } catch (err) {
        console.error('[Team] Error:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Error</h1>
        <p className="text-slate-600 mb-6">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  const activeMembers = members.filter((m) => m.isActive);
  const pendingMembers = members.filter((m) => !m.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-slate-500">
            {members.length} member{members.length !== 1 ? 's' : ''} in your organization
          </p>
        </div>
        {canInvite && (
          <Button
            onClick={() => navigate('/org/invite')}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        )}
      </div>

      {/* Active Members */}
      <div className="bg-white rounded shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <span className="font-medium text-slate-700">
            Active Members ({activeMembers.length})
          </span>
        </div>
        {activeMembers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No active members yet</div>
        ) : (
          <div className="divide-y">
            {activeMembers.map((member) => (
              <div key={member.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <span className="text-emerald-600 font-medium">
                      {member.fullName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{member.fullName}</p>
                    <p className="text-sm text-slate-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                    {ROLE_LABELS[member.role] || member.role}
                  </span>
                  {member.isOrgAdmin && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-600 rounded">Admin</span>
                  )}
                  <div className="text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last login: {formatDate(member.lastLoginAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {pendingMembers.length > 0 && (
        <div className="bg-white rounded shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-amber-50 flex items-center gap-2">
            <Mail className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-amber-700">
              Pending Invitations ({pendingMembers.length})
            </span>
          </div>
          <div className="divide-y">
            {pendingMembers.map((member) => (
              <div key={member.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <Mail className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{member.fullName}</p>
                    <p className="text-sm text-slate-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                    {ROLE_LABELS[member.role] || member.role}
                  </span>
                  <span className="text-amber-600 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Invited {formatDate(member.createdAt)}
                  </span>
                  {canInvite && (
                    <Button variant="ghost" size="sm" className="text-emerald-600">
                      Resend
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
