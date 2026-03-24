/**
 * Customer Detail Drawer
 *
 * Side drawer showing full customer details: company info, contacts,
 * Salesforce orgs, projects, engagement summary, and notes.
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Globe,
  Mail,
  Phone,
  User,
  Building2,
  Cloud,
  CloudOff,
  ArrowRight,
  FolderKanban,
  Users,
  Calendar,
  StickyNote,
} from 'lucide-react';
import type {
  Customer,
  CustomerContact,
  SalesforceOrgInfo,
  CustomerProject,
} from '../mocks/customer-mock-data';

// ─── Helpers ─────────────────────────────────────────────────

function useFormatDate() {
  const { i18n } = useTranslation();
  return (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
}

function useFormatTimeAgo() {
  const { t } = useTranslation();
  return (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('workspace.timeAgo.justNow');
    if (minutes < 60) return t('workspace.timeAgo.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('workspace.timeAgo.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('workspace.timeAgo.daysAgo', { count: days });
  };
}

const companySizeLabels: Record<string, string> = {
  startup: 'Startup',
  smb: 'SMB',
  'mid-market': 'Mid-Market',
  enterprise: 'Enterprise',
};

// ─── Sub-components ──────────────────────────────────────────

const SectionHeader = memo(function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6 first:mt-0">
      <Icon className="h-4 w-4 text-slate-400" />
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</h3>
    </div>
  );
});

const ContactCard = memo(function ContactCard({
  contact,
  isPrimary,
}: {
  contact: CustomerContact;
  isPrimary?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 shrink-0">
        <User className="h-4 w-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900 truncate">{contact.name}</p>
          {isPrimary && (
            <span className="text-[10px] font-medium bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">
              {t('customers.drawer.primaryContact')}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">{contact.role}</p>
        <div className="flex items-center gap-3 mt-1">
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
          >
            <Mail className="h-3 w-3" />
            {contact.email}
          </a>
          {contact.phone && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Phone className="h-3 w-3" />
              {contact.phone}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

const SalesforceOrgCard = memo(function SalesforceOrgCard({ org }: { org: SalesforceOrgInfo }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 py-2.5">
      {org.connected ? (
        <Cloud className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <CloudOff className="h-4 w-4 text-slate-300 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{org.orgName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-500">{org.instanceType}</span>
          {org.cpqEdition && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500">{org.cpqEdition}</span>
            </>
          )}
          {org.licenseCount && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500">
                {org.licenseCount} {t('customers.drawer.licenses')}
              </span>
            </>
          )}
        </div>
      </div>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          org.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
        }`}
      >
        {org.connected ? t('customers.drawer.connected') : t('customers.drawer.notConnected')}
      </span>
    </div>
  );
});

function stageColorClasses(color: string) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    sky: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' },
  };
  return map[color] || map.slate!;
}

const ProjectRow = memo(function ProjectRow({
  project,
  onNavigate,
  formatTimeAgo,
}: {
  project: CustomerProject;
  onNavigate: (id: string) => void;
  formatTimeAgo: (date: string) => string;
}) {
  const { t } = useTranslation();
  const colors = stageColorClasses(project.stageColor);

  return (
    <button
      onClick={() => onNavigate(project.id)}
      className="flex items-center gap-3 py-2.5 w-full text-start hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors group"
    >
      <FolderKanban className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate group-hover:text-violet-700 transition-colors">
          {project.name}
        </p>
        <p className="text-xs text-slate-400">{formatTimeAgo(project.updatedAt)}</p>
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${colors.bg} ${colors.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
        {t(`dashboard.stages.${project.stage}`)}
      </span>
    </button>
  );
});

// ─── Main Drawer ─────────────────────────────────────────────

interface CustomerDetailDrawerProps {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

export const CustomerDetailDrawer = memo(function CustomerDetailDrawer({
  customer,
  open,
  onClose,
}: CustomerDetailDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const formatTimeAgo = useFormatTimeAgo();

  if (!open || !customer) return null;

  const handleNavigateToProject = (projectId: string) => {
    onClose();
    navigate(`/project/${projectId}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 end-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-end duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 shrink-0">
              <Building2 className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{customer.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500">{customer.industry}</span>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500">
                  {companySizeLabels[customer.companySize] || customer.companySize}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Website */}
          {customer.website && (
            <a
              href={customer.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 mb-4"
            >
              <Globe className="h-3.5 w-3.5" />
              {customer.website.replace('https://', '')}
              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </a>
          )}

          {/* Engagement Summary */}
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xl font-semibold text-slate-900">{customer.projectCount}</p>
              <p className="text-[11px] text-slate-500">{t('customers.drawer.projects')}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xl font-semibold text-slate-900">
                {customer.totalObjectsMigrated || '—'}
              </p>
              <p className="text-[11px] text-slate-500">{t('customers.drawer.objectsMigrated')}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xl font-semibold text-slate-900">
                {customer.totalRecordsMigrated
                  ? customer.totalRecordsMigrated.toLocaleString()
                  : '—'}
              </p>
              <p className="text-[11px] text-slate-500">{t('customers.drawer.recordsMigrated')}</p>
            </div>
          </div>

          {/* Contacts */}
          <SectionHeader icon={Users} label={t('customers.drawer.contacts')} />
          <div className="divide-y divide-slate-100">
            <ContactCard contact={customer.primaryContact} isPrimary />
            {customer.additionalContacts?.map((contact, i) => (
              <ContactCard key={i} contact={contact} />
            ))}
          </div>

          {/* Salesforce Orgs */}
          <SectionHeader icon={Cloud} label={t('customers.drawer.salesforceOrgs')} />
          <div className="divide-y divide-slate-100">
            {customer.salesforceOrgs.map((org, i) => (
              <SalesforceOrgCard key={i} org={org} />
            ))}
          </div>

          {/* Projects */}
          <SectionHeader icon={FolderKanban} label={t('customers.drawer.projectsList')} />
          {customer.projects.length > 0 ? (
            <div className="space-y-0.5">
              {customer.projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onNavigate={handleNavigateToProject}
                  formatTimeAgo={formatTimeAgo}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-3">{t('customers.drawer.noProjects')}</p>
          )}

          {/* Notes */}
          {customer.notes && (
            <>
              <SectionHeader icon={StickyNote} label={t('customers.drawer.notes')} />
              <div className="rounded-xl bg-amber-50/50 p-4">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {customer.notes}
                </p>
              </div>
            </>
          )}

          {/* Dates */}
          <SectionHeader icon={Calendar} label={t('customers.drawer.timeline')} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-slate-400">{t('customers.drawer.customerSince')}</p>
              <p className="text-sm font-medium text-slate-700">{formatDate(customer.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">{t('customers.drawer.lastActivity')}</p>
              <p className="text-sm font-medium text-slate-700">
                {formatTimeAgo(customer.lastActivityAt)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
