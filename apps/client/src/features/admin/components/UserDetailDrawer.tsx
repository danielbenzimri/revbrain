import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Loader2,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  X,
  AlertTriangle,
  Smartphone,
  Camera,
} from 'lucide-react';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { ALL_ROLES } from '@revbrain/contract';
import { getAuthHeaders } from '@/lib/auth-headers';
import type { AdminUser } from '../hooks/use-admin-users';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

const editUserSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  role: z.string(),
  jobTitle: z.string().optional(),
  phoneNumber: z.string().optional(),
  mobileNumber: z.string().optional(),
  address: z.string().optional(),
  age: z.string().optional(),
  bio: z.string().max(500).optional(),
});

type EditUserForm = z.infer<typeof editUserSchema>;

interface UserDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  onSave: (id: string, data: Partial<AdminUser>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function UserDetailDrawer({
  open,
  onOpenChange,
  user,
  onSave,
  onDelete,
}: UserDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      fullName: '',
      role: 'org_owner',
      jobTitle: '',
      phoneNumber: '',
      mobileNumber: '',
      address: '',
      age: '',
      bio: '',
    },
  });

  // Track which user ID was last loaded to avoid resetting edit mode on refetch
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (user) {
      const isNewUser = prevUserIdRef.current !== user.id;
      prevUserIdRef.current = user.id;

      form.reset({
        fullName: user.name,
        role: user.role,
        jobTitle: user.jobTitle || '',
        phoneNumber: user.phoneNumber || '',
        mobileNumber: user.mobileNumber || '',
        address: user.address || '',
        age: user.age != null ? String(user.age) : '',
        bio: user.bio || '',
      });

      if (isNewUser) {
        setIsEditing(false);
        setShowDeleteConfirm(false);
      }
    }
  }, [user, form]);

  const onSubmit = async (data: EditUserForm) => {
    if (!user) return;
    try {
      setIsSaving(true);
      await onSave(user.id, {
        name: data.fullName,
        role: data.role,
        jobTitle: data.jobTitle || undefined,
        phoneNumber: data.phoneNumber || undefined,
        mobileNumber: data.mobileNumber || undefined,
        address: data.address || undefined,
        age: data.age !== '' && data.age !== undefined ? Number(data.age) : undefined,
        bio: data.bio || undefined,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save user', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      setIsDeleting(true);
      await onDelete(user.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to delete user', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!user) return null;

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getRoleLabel = (role: string) =>
    t(`admin.users.roles.${role}.label`, role.replace(/_/g, ' '));

  const handleClose = () => {
    setShowDeleteConfirm(false);
    setIsEditing(false);
    onOpenChange(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile || !user) return;

    setIsUploading(true);
    try {
      // Resize to 256x256 WebP before upload (no large images stored for avatars)
      const { resizeImageForAvatar } = await import('@/lib/resize-image');
      const file = await resizeImageForAvatar(rawFile);

      const formData = new FormData();
      formData.append('file', file);

      const headers = await getAuthHeaders();
      // Remove Content-Type to let browser set multipart boundary
      delete (headers as Record<string, string>)['Content-Type'];

      const res = await fetch(`${apiUrl}/v1/users/me/avatar`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      // Trigger a refetch of the user data by re-saving
      await onSave(user.id, {});
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setIsUploading(false);
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        // Only allow closing via our explicit handleClose — prevent Radix auto-close
        // which can fire during content transitions (view→edit mode switch)
        if (!isOpen && !isEditing) {
          onOpenChange(false);
        }
      }}
    >
      <SheetContent
        side={isRTL ? 'left' : 'right'}
        className="w-full sm:max-w-lg p-0 flex flex-col bg-white"
        hideCloseButton
        onInteractOutside={(e) => {
          // Prevent closing when clicking outside while in edit mode
          if (isEditing) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // In edit mode, Escape exits edit mode instead of closing drawer
          if (isEditing) {
            e.preventDefault();
            setIsEditing(false);
          }
        }}
      >
        {/* Header — subtle gradient with accent */}
        <div className="relative">
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-violet-500 via-violet-400 to-teal-400" />

          <div className="bg-gradient-to-b from-slate-50 to-white px-6 pt-5 pb-5 border-b border-slate-100">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 end-4 p-1.5 rounded-lg hover:bg-white/80 transition-colors text-slate-400 hover:text-slate-600"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            {/* User identity */}
            <div className="flex flex-col items-center text-center pt-1">
              <div
                className={`relative ${isEditing ? 'cursor-pointer' : ''}`}
                onClick={() => isEditing && fileInputRef.current?.click()}
              >
                <Avatar className="h-18 w-18 ring-3 ring-white shadow-md">
                  <AvatarImage src={user.avatarUrl} />
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-teal-600 text-white text-xl font-bold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                {isEditing && !isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full transition-opacity">
                    <Camera size={20} className="text-white" />
                  </div>
                )}
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                    <Loader2 size={20} className="text-white animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              {isEditing && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-violet-600 hover:text-violet-700 font-medium mt-1.5"
                >
                  Change photo
                </button>
              )}

              <h2 className="text-xl font-bold text-slate-900 mt-3 truncate max-w-full">
                {user.name}
              </h2>
              <p className="text-sm text-slate-500 truncate max-w-full">{user.email}</p>

              <div className="flex flex-wrap justify-center gap-2 mt-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white text-slate-600 shadow-sm border border-slate-200/80">
                  {getRoleLabel(user.role)}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium shadow-sm ${
                    user.status === 'active'
                      ? 'bg-violet-50 text-violet-700 border border-violet-200/80'
                      : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full me-1.5 ${
                      user.status === 'active' ? 'bg-violet-500' : 'bg-amber-500'
                    }`}
                  />
                  {user.status === 'active'
                    ? t('admin.users.active')
                    : t('admin.users.pendingInvitation')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {showDeleteConfirm ? (
            <div className="p-6">
              <div className="bg-red-50 rounded-lg p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
                  </div>
                  <h3 className="font-semibold text-red-900 text-sm">
                    {t('admin.users.deleteConfirmTitle')}
                  </h3>
                </div>
                <p className="text-sm text-red-700/80 leading-relaxed">
                  {t('admin.users.deleteConfirmDesc', { name: user.name })}
                </p>
                <div className="flex gap-3 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1"
                    disabled={isDeleting}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1"
                  >
                    {isDeleting && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
                    {isDeleting ? t('admin.users.deleting') : t('admin.users.deleteConfirmAction')}
                  </Button>
                </div>
              </div>
            </div>
          ) : isEditing ? (
            <div className="px-6 py-5 space-y-5">
              <FormField
                label={t('admin.users.fullName')}
                htmlFor="fullName"
                error={form.formState.errors.fullName?.message}
              >
                <Input id="fullName" {...form.register('fullName')} className="border-slate-200" />
              </FormField>

              <FormField label={t('admin.users.role')} htmlFor="role">
                <Select
                  defaultValue={form.getValues('role')}
                  onValueChange={(val) => form.setValue('role', val)}
                >
                  <SelectTrigger className="border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {getRoleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="h-px bg-slate-100" />

              <FormField label={t('admin.users.jobTitle')} htmlFor="jobTitle">
                <Input id="jobTitle" {...form.register('jobTitle')} className="border-slate-200" />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label={t('admin.users.phone')} htmlFor="phoneNumber">
                  <Input
                    id="phoneNumber"
                    {...form.register('phoneNumber')}
                    className="border-slate-200"
                  />
                </FormField>
                <FormField label={t('admin.users.mobileNumber')} htmlFor="mobileNumber">
                  <Input
                    id="mobileNumber"
                    {...form.register('mobileNumber')}
                    className="border-slate-200"
                  />
                </FormField>
              </div>

              <FormField label={t('admin.users.address')} htmlFor="address">
                <Input id="address" {...form.register('address')} className="border-slate-200" />
              </FormField>

              <FormField label={t('admin.users.age')} htmlFor="age">
                <Input
                  id="age"
                  type="number"
                  {...form.register('age')}
                  className="border-slate-200 max-w-24"
                />
              </FormField>

              <div className="h-px bg-slate-100" />

              <FormField label={t('admin.users.bio')} htmlFor="bio">
                <Input id="bio" {...form.register('bio')} className="border-slate-200" />
              </FormField>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Contact details */}
              <div className="px-6 py-5 space-y-4">
                <SectionLabel>{t('admin.users.contactInfo')}</SectionLabel>
                <div className="space-y-3">
                  <DetailRow icon={Mail} label={t('admin.users.email')} value={user.email} />
                  <DetailRow
                    icon={Building2}
                    label={t('admin.users.table.organization')}
                    value={user.org || t('admin.users.noOrg')}
                    muted={!user.org}
                  />
                  {user.jobTitle && (
                    <DetailRow
                      icon={Briefcase}
                      label={t('admin.users.jobTitle')}
                      value={user.jobTitle}
                    />
                  )}
                  {user.phoneNumber && (
                    <DetailRow
                      icon={Phone}
                      label={t('admin.users.phone')}
                      value={user.phoneNumber}
                    />
                  )}
                  {user.mobileNumber && (
                    <DetailRow
                      icon={Smartphone}
                      label={t('admin.users.mobileNumber')}
                      value={user.mobileNumber}
                    />
                  )}
                  {user.address && (
                    <DetailRow
                      icon={MapPin}
                      label={t('admin.users.address')}
                      value={user.address}
                    />
                  )}
                </div>
              </div>

              {/* Bio */}
              {user.bio && (
                <div className="px-6 py-5">
                  <SectionLabel>{t('admin.users.bio')}</SectionLabel>
                  <p className="text-sm text-slate-600 leading-relaxed mt-2">{user.bio}</p>
                </div>
              )}

              {/* Activity */}
              <div className="px-6 py-5">
                <SectionLabel>{t('admin.users.lastActive')}</SectionLabel>
                <div className="mt-3 flex gap-6">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">{t('admin.users.joined')}</p>
                    <p className="text-sm font-medium text-slate-700">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">{t('admin.users.lastActive')}</p>
                    <p className="text-sm font-medium text-slate-700">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString()
                        : t('admin.users.never')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showDeleteConfirm && (
          <div className="border-t border-slate-100 px-6 py-3.5 flex items-center gap-3">
            {isEditing ? (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  {t('common.cancel')}
                </Button>
                <div className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving}
                  onClick={form.handleSubmit(onSubmit)}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {isSaving && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
                  {isSaving ? t('common.saving') : t('admin.users.saveChanges')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 me-1.5" />
                  {t('common.delete')}
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {t('admin.users.editDetails')}
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{children}</p>;
}

function DetailRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-slate-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`text-sm truncate ${muted ? 'text-slate-400 italic' : 'text-slate-700'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-slate-500">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
