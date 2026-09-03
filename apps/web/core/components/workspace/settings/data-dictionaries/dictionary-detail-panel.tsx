import { useCallback, useState } from "react";
import type {
  TBulkCreateDataDictionaryItemsResponse,
  TCreateDataDictionaryItemPayload,
  TDataDictionary,
  TDataDictionaryItem,
  TUpdateDataDictionaryItemPayload,
  TUpdateDataDictionaryPayload,
} from "@plane/types";
import type { useDictionaryUsage } from "@/hooks/store/use-dictionary-usage";
import { DictionaryBulkAddModal } from "./dictionary-bulk-add-modal";
import { DictionaryEditModal } from "./dictionary-edit-modal";
import { DictionaryHeader } from "./dictionary-header";
import type { TDictionaryItemFormValue } from "./dictionary-item-form";
import { DictionaryItemsTable } from "./dictionary-items-table";
import { DictionaryItemsToolbar } from "./dictionary-items-toolbar";
import { useDictionaryItemsView } from "./use-dictionary-items-view";

type Props = {
  dictionary: TDataDictionary;
  canEdit: boolean;
  usage: ReturnType<typeof useDictionaryUsage>;
  onUpdate: (dictionaryId: string, payload: TUpdateDataDictionaryPayload) => Promise<TDataDictionary>;
  onDelete: (dictionary: TDataDictionary) => void;
  onCreateItem: (dictionaryId: string, payload: TCreateDataDictionaryItemPayload) => Promise<TDataDictionaryItem>;
  onUpdateItem: (
    dictionaryId: string,
    itemId: string,
    payload: TUpdateDataDictionaryItemPayload
  ) => Promise<TDataDictionaryItem>;
  onDeleteItem: (item: TDataDictionaryItem) => void;
  onBulkCreateItems: (dictionaryId: string, labels: string[]) => Promise<TBulkCreateDataDictionaryItemsResponse>;
  onReorder: (
    dictionaryId: string,
    orderedItems: TDataDictionaryItem[],
    movedItem: TDataDictionaryItem
  ) => Promise<void>;
};

/**
 * 右栏：头部 / 工具栏 / 值表格。调用方用 key={dictionary.id} 挂载，切换字典时靠重新挂载把搜索、分页、编辑态归零。
 * 编辑行与新增行互斥，同一时刻只有一个。
 */
export function DictionaryDetailPanel(props: Props) {
  const { dictionary, canEdit, usage, onUpdate, onDelete, onCreateItem, onUpdateItem, onDeleteItem, onBulkCreateItems, onReorder } =
    props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addFocusToken, setAddFocusToken] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  const view = useDictionaryItemsView(dictionary.items, { canEdit, isEditing: editingId !== null || isAdding });
  // view 每次渲染都是新对象，回调只依赖用到的两个稳定方法，免得表格里的 Sortable 反复重订阅
  const { revealItem, toFullOrder } = view;

  const isLabelTaken = useCallback(
    (label: string, exceptId?: string) => dictionary.items.some((item) => item.id !== exceptId && item.label === label),
    [dictionary.items]
  );

  const startEdit = useCallback((item: TDataDictionaryItem) => {
    setIsAdding(false);
    setEditingId(item.id);
  }, []);

  const saveEdit = useCallback(
    async (item: TDataDictionaryItem, value: TDictionaryItemFormValue) => {
      const payload: TUpdateDataDictionaryItemPayload = { label: value.label };
      if (dictionary.is_colored) payload.color = value.color;
      await onUpdateItem(dictionary.id, item.id, payload);
      setEditingId(null);
    },
    [dictionary.id, dictionary.is_colored, onUpdateItem]
  );

  const changeColor = useCallback(
    (item: TDataDictionaryItem, color: string) => onUpdateItem(dictionary.id, item.id, { color }),
    [dictionary.id, onUpdateItem]
  );

  const openAdd = useCallback(() => {
    if (isAdding) {
      setAddFocusToken((token) => token + 1);
      return;
    }
    setEditingId(null);
    setIsAdding(true);
  }, [isAdding]);

  const createItem = useCallback(
    async (value: TDictionaryItemFormValue) => {
      const payload: TCreateDataDictionaryItemPayload = { label: value.label };
      if (dictionary.is_colored && value.color) payload.color = value.color;
      const created = await onCreateItem(dictionary.id, payload);
      revealItem(created);
    },
    [dictionary.id, dictionary.is_colored, onCreateItem, revealItem]
  );

  const bulkCreate = useCallback(
    async (labels: string[]) => {
      const response = await onBulkCreateItems(dictionary.id, labels);
      if (response.created[0]) revealItem(response.created[0]);
      return response;
    },
    [dictionary.id, onBulkCreateItems, revealItem]
  );

  const pageReorder = useCallback(
    (pageOrdered: TDataDictionaryItem[], moved: TDataDictionaryItem) => {
      void onReorder(dictionary.id, toFullOrder(pageOrdered), moved);
    },
    [dictionary.id, onReorder, toFullOrder]
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <DictionaryHeader
        dictionary={dictionary}
        canEdit={canEdit}
        onToggleColored={(isColored) => onUpdate(dictionary.id, { is_colored: isColored })}
        onEdit={() => setIsEditModalOpen(true)}
        onDelete={() => onDelete(dictionary)}
      />
      <DictionaryItemsToolbar
        search={view.search}
        onSearchChange={view.setSearch}
        sort={view.sort}
        onSortChange={view.setSort}
        canEdit={canEdit}
        dragDisabledReason={view.dragDisabledReason}
        onAdd={openAdd}
        onBulkAdd={() => setIsBulkOpen(true)}
      />
      <DictionaryItemsTable
        dictionary={dictionary}
        canEdit={canEdit}
        canDrag={view.canDrag}
        pageItems={view.pageItems}
        pageOffset={view.pageOffset}
        total={view.total}
        page={view.page}
        pageCount={view.pageCount}
        pageSize={view.pageSize}
        onPageChange={view.setPage}
        onPageSizeChange={view.setPageSize}
        editingId={editingId}
        isAdding={isAdding}
        addFocusToken={addFocusToken}
        highlightId={view.highlightId}
        usage={usage.usage}
        usageEntity={usage.entity}
        usageLoading={usage.isLoading}
        usageError={usage.error}
        isLabelTaken={isLabelTaken}
        onStartEdit={startEdit}
        onCancelEdit={() => setEditingId(null)}
        onSaveEdit={saveEdit}
        onChangeColor={changeColor}
        onDelete={onDeleteItem}
        onCreate={createItem}
        onCancelAdd={() => setIsAdding(false)}
        onPageReorder={pageReorder}
      />

      <DictionaryEditModal
        isOpen={isEditModalOpen}
        dictionary={dictionary}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={(payload) => onUpdate(dictionary.id, payload)}
      />
      <DictionaryBulkAddModal
        isOpen={isBulkOpen}
        dictionary={dictionary}
        onClose={() => setIsBulkOpen(false)}
        onSubmit={bulkCreate}
      />
    </section>
  );
}
