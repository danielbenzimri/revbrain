/**
 * BOQ Page
 *
 * Bill of Quantities management with tree view and import
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProject } from '../../hooks/use-project-api';
import {
  useBOQTree,
  useBOQItems,
  useCreateBOQItem,
  useUpdateBOQItem,
  useDeleteBOQItem,
} from '@/features/boq/hooks/use-boq';
import type { BOQItem, CreateBOQItemInput, UpdateBOQItemInput } from '@/features/boq/hooks/use-boq';
import {
  BOQTree,
  BOQImportSheet,
  BOQItemFormSheet,
  BOQSummaryCard,
} from '@/features/boq/components';

export default function BOQPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project } = useProject(id);
  const [importOpen, setImportOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BOQItem | null>(null);

  const { data: boqItems, isLoading: boqLoading } = useBOQTree(id || '');
  const { data: boqFlatData } = useBOQItems(id || '');
  const createBOQItem = useCreateBOQItem();
  const updateBOQItem = useUpdateBOQItem();
  const deleteBOQItem = useDeleteBOQItem();

  const handleItemClick = (item: BOQItem) => {
    setSelectedItem(item);
    setItemFormOpen(true);
  };

  const handleCreateItem = () => {
    setSelectedItem(null);
    setItemFormOpen(true);
  };

  const handleItemSave = async (data: CreateBOQItemInput | UpdateBOQItemInput, isEdit: boolean) => {
    if (isEdit && selectedItem) {
      await updateBOQItem.mutateAsync({ id: selectedItem.id, data: data as UpdateBOQItemInput });
    } else {
      await createBOQItem.mutateAsync(data as CreateBOQItemInput);
    }
  };

  const handleItemDelete = async (itemId: string) => {
    if (!id) return;
    await deleteBOQItem.mutateAsync({ id: itemId, projectId: id });
  };

  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full">
      <div className="space-y-4">
        {/* BOQ Summary */}
        <BOQSummaryCard projectId={id || ''} projectName={project?.name || ''} />

        {/* BOQ Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded shadow-sm p-4">
          <div>
            <h3 className="font-semibold">{t('boq.title')}</h3>
            <p className="text-sm text-neutral-500">{t('boq.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCreateItem}>
              <Plus className="h-4 w-4 me-1" />
              {t('boq.item.create')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 me-1" />
              {t('boq.import.button')}
            </Button>
          </div>
        </div>

        {/* BOQ Tree */}
        <BOQTree
          items={boqItems || []}
          isLoading={boqLoading}
          onItemClick={handleItemClick}
          selectedId={selectedItem?.id}
        />

        {/* Import Sheet */}
        <BOQImportSheet
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={id || ''}
          onSuccess={() => {
            // React Query will auto-refetch
          }}
        />

        {/* Item Form Sheet */}
        <BOQItemFormSheet
          open={itemFormOpen}
          onOpenChange={setItemFormOpen}
          projectId={id || ''}
          item={selectedItem}
          parentItems={boqFlatData?.items || []}
          onSave={handleItemSave}
          onDelete={handleItemDelete}
        />
      </div>
    </div>
  );
}
