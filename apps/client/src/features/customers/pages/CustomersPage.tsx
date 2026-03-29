/**
 * Customers Page
 *
 * Displays a grid of customer cards with search, stats strip,
 * detail drawer, and empty state.
 */
import { memo, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Users,
  Factory,
  Search,
  Plus,
  ArrowRight,
  Mail,
  User,
  FolderKanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MOCK_CUSTOMERS, type Customer } from '../mocks/customer-mock-data';
import { CustomerDetailDrawer } from '../components/CustomerDetailDrawer';

// ─── Stat Card ───────────────────────────────────────────────

const StatCard = memo(function StatCard({
  value,
  label,
  icon: Icon,
  color,
}: {
  value: number;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="rounded-2xl bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[color] || colorMap.slate}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
});

// ─── Customer Card ──────────────────────────────────────────

const CustomerCard = memo(function CustomerCard({
  customer,
  onClick,
}: {
  customer: Customer;
  onClick: (customer: Customer) => void;
}) {
  const { t } = useTranslation();

  const industryColors: Record<string, { bg: string; text: string }> = {
    Technology: { bg: 'bg-sky-50', text: 'text-sky-700' },
    'Financial Services': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Manufacturing: { bg: 'bg-amber-50', text: 'text-amber-700' },
  };
  const colors = industryColors[customer.industry] || {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
  };

  return (
    <button
      onClick={() => onClick(customer)}
      className="group w-full rounded-2xl bg-white p-5 text-start transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1 me-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate group-hover:text-violet-700 transition-colors">
              {customer.name}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${colors.bg} ${colors.text}`}
            >
              {customer.industry}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{customer.primaryContact.name}</span>
          <span className="text-xs text-slate-300">·</span>
          <span className="text-xs text-slate-400 truncate">{customer.primaryContact.role}</span>
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{customer.primaryContact.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <FolderKanban className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>
            {customer.projectCount} {t('customers.card.projects')}
            {customer.activeProjectCount > 0 && (
              <span className="text-emerald-600 ms-1">
                ({customer.activeProjectCount} {t('customers.card.activeProjects')})
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <span className="text-xs font-medium text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
          {t('customers.card.viewDetails')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </span>
      </div>
    </button>
  );
});

// ─── Empty State ─────────────────────────────────────────────

const EmptyCustomers = memo(function EmptyCustomers() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50 mb-6">
        <Building2 className="h-10 w-10 text-violet-500" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('customers.empty.title')}</h2>
      <p className="text-sm text-slate-500 text-center max-w-md mb-6">
        {t('customers.empty.description')}
      </p>
      <Button className="bg-violet-600 hover:bg-violet-700">
        <Plus className="h-4 w-4 me-2" />
        {t('customers.empty.addCustomer')}
      </Button>
    </div>
  );
});

// ─── Main Page ───────────────────────────────────────────────

export default function CustomersPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMockMode = import.meta.env.VITE_AUTH_MODE === 'mock';
  const customers = useMemo(() => (isMockMode ? MOCK_CUSTOMERS : []), [isMockMode]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const query = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.industry.toLowerCase().includes(query) ||
        c.primaryContact.name.toLowerCase().includes(query)
    );
  }, [customers, searchQuery]);

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.activeProjectCount > 0).length;
  const uniqueIndustries = new Set(customers.map((c) => c.industry)).size;

  const handleOpenDrawer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedCustomer(null);
  }, []);

  if (totalCustomers === 0) {
    return <EmptyCustomers />;
  }

  return (
    <>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('customers.title')}</h1>
            <p className="text-sm text-slate-500">{t('customers.subtitle')}</p>
          </div>
          <Button className="bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4 me-2" />
            {t('customers.addCustomer')}
          </Button>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard
            value={totalCustomers}
            label={t('customers.stats.totalCustomers')}
            icon={Building2}
            color="slate"
          />
          <StatCard
            value={activeCustomers}
            label={t('customers.stats.activeCustomers')}
            icon={Users}
            color="violet"
          />
          <StatCard
            value={uniqueIndustries}
            label={t('customers.stats.industries')}
            icon={Factory}
            color="emerald"
          />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('customers.searchPlaceholder')}
            className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Customer Grid */}
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-500">{t('customers.noResults')}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredCustomers.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} onClick={handleOpenDrawer} />
            ))}
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <CustomerDetailDrawer
        customer={selectedCustomer}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </>
  );
}
