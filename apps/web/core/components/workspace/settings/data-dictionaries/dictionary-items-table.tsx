import { useCallback } from "react";
import { useTranslation } from "@plane/i18n";
import type { TDataDictionary, TDataDictionaryItem, TDataDictionaryUsageEntity } from "@plane/types";
import { Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TDictionaryUsageMap } from "@/hooks/store/use-dictionary-usage";
import { DictionaryItemForm } from "./dictionary-item-form";
import type { TDictionaryItemFormValue } from "./dictionary-item-form";
import { DictionaryItemRow } from "./dictionary-item-row";
import { ITEM_ROW_GRID } from "./dictionary-items-grid";
import { DictionaryItemsPagination } from "./dictionary-items-pagination";
import { PAGE_SIZE_OPTIONS } from "./use-dictionary-items-view";

type Props = {
  dictionary: TDataDictionary;
  canEdit: boolean;
  canDrag: boolean;
  pageItems: TDataDictionaryItem[];
  pageOffset: number;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  editingId: string | null;
  isAdding: boolean;
  addFocusToken: number;
  highlightId: string | null;
  usage: TDictionaryUsageMap | null;
  usageEntity: TDataDictionaryUsageEntity;
  usageLoading: boolean;
  usageError: boolean;
  isLabelTaken: (label: string, exceptId?: string) => boolean;
  onStartEdit: (item: TDataDictionaryItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (item: TDataDictionaryItem, value: TDictionaryItemFormValue) => Promise<unknown>;
  onChangeColor: (item: TDataDictionaryItem, color: string) => Promise<unknown>;
  onDelete: (item: TDataDictionaryItem) => void;
  onCreate: (value: TDictionaryItemFormValue) => Promise<unknown>;
  onCancelAdd: () => void;
  /** 当页拖完的顺序；调用方负责 splice 回整字典 */
  onPageReorder: (pageOrdered: TDataDictionaryItem[], moved: TDataDictionaryItem) => void;
};

const I18N = "workspace_settings.settings.data_dictionaries";
// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (item: TDataDictionaryItem) => item.id;

/**
 * 值表格：div + CSS grid（Sortable 给每项包一层 div 并插 DropIndicator，放不进 tbody）。
 * 唯一滚动容器在中间，表头 sticky，分页条在滚动容器外。
 */
export function DictionaryItemsTable(props: Props) {
  const {
    dictionary,
    canEdit,
    canDrag,
    pageItems,
    pageOffset,
    total,
    page,
    pageCount,
    pageSize,
    onPageChange,
    onPageSizeChange,
    editingId,
    isAdding,
    addFocusToken,
    highlightId,
    usage,
    usageEntity,
    usageLoading,
    usageError,
    isLabelTaken,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onChangeColor,
    onDelete,
    onCreate,
    onCancelAdd,
    onPageReorder,
  } = props;
  const { t } = useTranslation();

  const handleReorder = useCallback(
    (data: TDataDictionaryItem[], movedItem?: TDataDictionaryItem) => {
      if (!movedItem) return;
      onPageReorder(data, movedItem);
    },
    [onPageReorder]
  );

  const renderRow = (item: TDataDictionaryItem, index: number) => (
    <DictionaryItemRow
      key={item.id}
      item={item}
      rowNumber={pageOffset + index + 1}
      isColored={dictionary.is_colored}
      canEdit={canEdit}
      canDrag={canDrag}
      isEditing={editingId === item.id}
      isHighlighted={highlightId === item.id}
      usage={usage?.get(item.id)}
      usageEntity={usageEntity}
      usageLoading={usageLoading}
      usageError={usageError}
      isLabelTaken={isLabelTaken}
      onStartEdit={onStartEdit}
      onCancelEdit={onCancelEdit}
      onSaveEdit={onSaveEdit}
      onChangeColor={onChangeColor}
      onDelete={onDelete}
    />
  );

  const renderBody = () => {
    if (pageItems.length === 0) {
      if (isAdding) return null;
      return (
        <p className="px-3 py-10 text-center text-12 text-placeholder">
          {t(dictionary.items.length === 0 ? `${I18N}.detail.no_values` : `${I18N}.table.no_match`)}
        </p>
      );
    }
    if (canDrag) {
      return (
        <Sortable
          id={`dictionary-items-${dictionary.id}`}
          data={pageItems}
          keyExtractor={keyExtractor}
          onChange={handleReorder}
          render={renderRow}
        />
      );
    }
    // Sortable 没有 disabled 开关：只读 / 搜索中 / 非手动顺序 / 有行在编辑时直接不挂拖拽
    return pageItems.map(renderRow);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1">
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-auto">
        <div role="table" className="flex min-w-[640px] flex-col">
          <div
            role="row"
            className={cn(
              ITEM_ROW_GRID,
              "sticky top-0 z-10 h-9 border-b border-subtle bg-layer-1 text-11 font-medium text-tertiary"
            )}
          >
            <span />
            <span>{t(`${I18N}.table.col_index`)}</span>
            <span>{t(`${I18N}.table.col_value`)}</span>
            <span>{t(`${I18N}.table.col_usage`)}</span>
            <span>{t(`${I18N}.table.col_created`)}</span>
            <span />
          </div>
          {isAdding && (
            <DictionaryItemForm
              key="__new__"
              mode="create"
              initialLabel=""
              initialColor=""
              showColor={dictionary.is_colored}
              isLabelTaken={(label) => isLabelTaken(label)}
              onSubmit={onCreate}
              onCancel={onCancelAdd}
              focusToken={addFocusToken}
            />
          )}
          {renderBody()}
        </div>
      </div>
      <DictionaryItemsPagination
        total={total}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
