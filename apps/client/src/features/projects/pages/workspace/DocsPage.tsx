/**
 * Docs Page
 *
 * Project documents management ("אסמכתאות")
 */
import { useParams } from 'react-router-dom';
import { DocumentsView } from '@/features/docs';

export default function DocsPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full">
      <DocumentsView projectId={id} />
    </div>
  );
}
