/**
 * Project Overview Page
 *
 * Displays project summary and key metrics.
 * Will be expanded with RevBrain-specific content.
 */
import { useParams } from 'react-router-dom';
import { useProject } from '@/features/projects/hooks/use-project-api';
import { Loader2, Calendar, FileText } from 'lucide-react';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id);

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Info */}
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Project Details</h2>
          {project.description && <p className="text-slate-600">{project.description}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">Start Date</p>
                <p className="text-sm font-medium">{formatDate(project.startDate)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">End Date</p>
                <p className="text-sm font-medium">{formatDate(project.endDate)}</p>
              </div>
            </div>
          </div>
          {project.notes && (
            <div className="pt-3 border-t">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">Notes</p>
                  <p className="text-sm text-slate-600">{project.notes}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Status</p>
              <p className="text-sm font-medium capitalize">{project.status}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Created</p>
              <p className="text-sm font-medium">{formatDate(project.createdAt)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Last Updated</p>
              <p className="text-sm font-medium">{formatDate(project.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
