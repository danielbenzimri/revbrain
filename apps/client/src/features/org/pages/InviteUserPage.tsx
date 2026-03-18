import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types/auth';

/**
 * Roles that can be invited by org admins
 * Grouped by org type
 */
const INVITABLE_ROLES = {
  contractor: [
    {
      value: 'contractor_pm',
      label: 'Project Manager',
      description: 'Manages construction projects',
    },
    {
      value: 'execution_engineer',
      label: 'Execution Engineer',
      description: 'Handles field execution',
    },
    {
      value: 'quantity_surveyor',
      label: 'Quantity Surveyor',
      description: 'Manages quantities and costs',
    },
    {
      value: 'quality_controller',
      label: 'Quality Controller',
      description: 'Ensures quality standards',
    },
  ],
  client: [
    { value: 'client_pm', label: 'Project Manager', description: 'Manages client-side projects' },
    { value: 'inspector', label: 'Inspector', description: 'Inspects and approves work' },
    { value: 'quality_assurance', label: 'Quality Assurance', description: 'Monitors quality' },
    { value: 'accounts_controller', label: 'Accounts Controller', description: 'Manages finances' },
  ],
} as const;

/**
 * InviteUserPage
 *
 * Org admin page to invite new users to their organization.
 * Accessible by contractor_ceo and client_owner roles.
 */
export default function InviteUserPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Determine org type from user role
  const isContractor = user?.role?.startsWith('contractor');
  const orgType = isContractor ? 'contractor' : 'client';
  const availableRoles = INVITABLE_ROLES[orgType];

  // Form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>(availableRoles[0].value);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string; seatsRemaining: number } | null>(null);

  // Check access - must be org admin or system admin
  const isOrgAdmin =
    user?.role === 'contractor_ceo' ||
    user?.role === 'client_owner' ||
    user?.role === 'system_admin';

  if (!isOrgAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-600 mb-6">Only organization administrators can invite users.</p>
        <Button
          onClick={() => navigate(user?.role === 'system_admin' ? '/admin' : '/')}
          variant="outline"
        >
          Go to Dashboard
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const session = await (await import('@/lib/services')).getAuthAdapter().getSession();

      const response = await fetch(`${apiUrl}/v1/org/invite`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          fullName,
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to invite user');
      }

      setSuccess({
        email,
        seatsRemaining: data.data.seatsRemaining,
      });
    } catch (err) {
      console.error('[Invite] Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Invitation Sent!</h1>
        <p className="text-slate-600 mb-2">
          An invitation email has been sent to <strong>{success.email}</strong>.
        </p>
        <p className="text-sm text-slate-500 mb-6">
          {success.seatsRemaining} seat{success.seatsRemaining !== 1 ? 's' : ''} remaining in your
          organization.
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => {
              setSuccess(null);
              setEmail('');
              setFullName('');
              setRole(availableRoles[0].value);
            }}
            variant="outline"
          >
            Invite Another
          </Button>
          <Button
            onClick={() => navigate(user?.role === 'system_admin' ? '/admin/users' : '/users')}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            View Team
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invite Team Member</h1>
          <p className="text-slate-500">Send an invitation to join your organization</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="bg-white rounded shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 text-slate-700">
            <UserPlus className="h-5 w-5" />
            <h2 className="font-semibold">User Details</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@company.com"
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Smith"
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Role *</label>
              <div className="grid gap-2">
                {availableRoles.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value as UserRole)}
                    className={`p-3 border rounded shadow-sm text-left transition-all ${
                      role === r.value
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-medium text-slate-900">{r.label}</p>
                    <p className="text-xs text-slate-500">{r.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !email || !fullName}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              'Send Invitation'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
