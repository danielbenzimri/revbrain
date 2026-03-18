/**
 * WorkLogResourceTable Component
 *
 * Matches legacy WorkLogsView resource table exactly
 * Shows resources with dual columns: contractorCount and supervisorCount
 */
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Truck, UserCheck } from 'lucide-react';
import type { WorkLogResourceEntry } from '../hooks/use-work-logs';

interface WorkLogResourceTableProps {
  resources: WorkLogResourceEntry[];
  title: string;
  isExternal: boolean;
  canContractorEdit: boolean;
  canSupervisorEdit: boolean;
  onUpdateResource: (
    resourceId: string,
    field: 'contractorCount' | 'supervisorCount',
    value: number
  ) => void;
  onDeleteResource: (resourceId: string) => void;
  onAddResource: () => void;
}

export function WorkLogResourceTable({
  resources,
  title,
  isExternal,
  canContractorEdit,
  canSupervisorEdit,
  onUpdateResource,
  onDeleteResource,
  onAddResource,
}: WorkLogResourceTableProps) {
  const { t } = useTranslation('workLogs');
  const Icon = isExternal ? UserCheck : Truck;

  return (
    <div className="bg-white rounded shadow-sm border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-sky-50 to-sky-100 p-4 border-b border-sky-200">
        <h3 className="text-lg font-bold text-sky-800 flex items-center gap-2">
          <Icon size={20} />
          {title}
        </h3>
      </div>
      <div className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right border-b border-slate-200">
              <th className="pb-2 font-medium text-slate-500">{t('resources.trade')}</th>
              <th className="pb-2 font-medium text-slate-500 w-24 text-center">
                {t('resources.contractorCount')}
              </th>
              <th className="pb-2 font-medium text-slate-500 w-24 text-center">
                {t('resources.supervisorCount')}
              </th>
              <th className="pb-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {resources.map((resource, idx) => {
              const resourceId = resource.id || `resource-${idx}`;
              return (
                <tr key={resourceId} className="border-b border-slate-100 last:border-0 group">
                  <td className="py-2 text-slate-700">{resource.type}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      value={resource.contractorCount}
                      onChange={(e) =>
                        onUpdateResource(
                          resourceId,
                          'contractorCount',
                          parseInt(e.target.value) || 0
                        )
                      }
                      className={`w-20 p-1.5 border rounded text-center outline-none ${
                        canContractorEdit
                          ? 'border-sky-200 bg-sky-50 focus:border-sky-400 focus:ring-1 focus:ring-sky-200'
                          : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                      min="0"
                      readOnly={!canContractorEdit}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      value={resource.supervisorCount}
                      onChange={(e) =>
                        onUpdateResource(
                          resourceId,
                          'supervisorCount',
                          parseInt(e.target.value) || 0
                        )
                      }
                      className={`w-20 p-1.5 border rounded text-center outline-none ${
                        canSupervisorEdit
                          ? 'border-green-200 bg-green-50 focus:border-green-400 focus:ring-1 focus:ring-green-200'
                          : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                      min="0"
                      readOnly={!canSupervisorEdit}
                    />
                  </td>
                  <td className="py-2">
                    {canContractorEdit && (
                      <button
                        onClick={() => onDeleteResource(resourceId)}
                        className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {canContractorEdit && (
          <button
            onClick={onAddResource}
            className="mt-3 flex items-center gap-1 text-sky-600 hover:text-sky-700 text-sm font-medium"
          >
            <Plus size={16} />
            {t('resources.add')}
          </button>
        )}
      </div>
    </div>
  );
}
