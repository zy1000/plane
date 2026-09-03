import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TDataDictionaryItem, TDataDictionaryItemUsage, TDataDictionaryUsageEntity } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { DictionaryColorPicker } from "./dictionary-color-picker";
import { DictionaryItemForm } from "./dictionary-item-form";
import type { TDictionaryItemFormValue } from "./dictionary-item-form";
import { ITEM_ROW_GRID } from "./dictionary-items-grid";

type Props = {
  item: TDataDictionaryItem;
  rowNumber: number;
  isColored: boolean;
  canEdit: boolean;
  /** 手动顺序且无搜索、无行在编辑时才渲染拖柄 */
  canDrag: boolean;
  isEditing: boolean;
  isHighlighted: boolean;
  usage: TDataDictionaryItemUsage | undefined;
  usageEntity: TDataDictionaryUsageEntity;
  usageLoading: boolean;
  usageError: boolean;
  isLabelTaken: (label: string, exceptId: string) => boolean;
  onStartEdit: (item: TDataDictionaryItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (item: TDataDictionaryItem, value: TDictionaryItemFormValue) => Promise<unknown>;
  onChangeColor: (item: TDataDictionaryItem, color: string) => Promise<unknown>;
  onDelete: (item: TDataDictionaryItem) => void;
};

const I18N = "workspace_settings.settings.data_dictionaries";
const ICON_BUTTON =
  "grid size-7 place-items-center rounded text-tertiary transition-colors hover:bg-layer-2 hover:text-primary";

export function DictionaryItemRow(props: Props) {
  const {
    item,
    rowNumber,
    isColored,
    canEdit,
    canDrag,
    isEditing,
    isHighlighted,
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
  } = props;
  const { t } = useTranslation();

  if (isEditing) {
    return (
      <DictionaryItemForm
        mode="edit"
        rowNumber={rowNumber}
        initialLabel={item.label}
        initialColor={item.color}
        showColor={isColored}
        isLabelTaken={(label) => isLabelTaken(label, item.id)}
        onSubmit={(value) => onSaveEdit(item, value)}
        onCancel={onCancelEdit}
      />
    );
  }

  const blocking = usage?.blocking ?? false;

  const renderUsage = () => {
    if (usageLoading) {
      return (
        <Loader className="flex">
          <Loader.Item height="12px" width="56px" />
        </Loader>
      );
    }
    if (usageError) return <span className="text-placeholder">{t(`${I18N}.table.usage_unavailable`)}</span>;
    const count = usage?.count ?? 0;
    // 没有引用不占位，留空即可
    if (!usageEntity || count === 0) return null;
    return (
      <span className="text-secondary">
        {t(`${I18N}.table.${usageEntity === "product" ? "usage_products" : "usage_projects"}`, { count })}
      </span>
    );
  };

  return (
    <div
      className={cn(
        ITEM_ROW_GRID,
        "group h-10 border-b border-subtle text-13 transition-colors hover:bg-layer-1-hover",
        isHighlighted && "bg-accent-primary/10"
      )}
      onDoubleClick={() => {
        if (canEdit) onStartEdit(item);
      }}
    >
      <span className="flex justify-center">
        {canDrag && (
          <GripVertical
            data-sortable-drag-handle
            className="size-3.5 cursor-grab text-placeholder active:cursor-grabbing"
            aria-label={t(`${I18N}.detail.drag_hint`)}
          />
        )}
      </span>
      <span className="text-12 tabular-nums text-tertiary">{rowNumber}</span>
      <span className="min-w-0 truncate font-medium text-primary">
        <DictionaryValueTag
          label={item.label}
          color={resolveDictionaryItemColor(item, { is_colored: isColored })}
          size="md"
        />
      </span>
      <span className="text-12 tabular-nums">{renderUsage()}</span>
      <span className="text-12 tabular-nums text-tertiary">
        {renderFormattedDate(item.created_at, "yyyy-MM-dd")}
      </span>
      <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => onStartEdit(item)}
              className={ICON_BUTTON}
              aria-label={t(`${I18N}.table.edit_value`)}
              title={t(`${I18N}.table.edit_value`)}
            >
              <Pencil className="size-3.5" />
            </button>
            {isColored && (
              <DictionaryColorPicker
                value={item.color}
                previewLabel={item.label}
                // 改色失败时 root 已 toast，这里没有表单可承接
                onChange={(color) => void onChangeColor(item, color).catch(() => undefined)}
              />
            )}
            <Tooltip disabled={!blocking} tooltipContent={t(`${I18N}.table.delete_blocked`)} position="left">
              <span className="inline-flex">
                <button
                  type="button"
                  disabled={blocking}
                  onClick={() => onDelete(item)}
                  className={cn(
                    ICON_BUTTON,
                    "hover:bg-danger-subtle hover:text-danger-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tertiary"
                  )}
                  aria-label={t(`${I18N}.detail.delete_value`)}
                  title={t(`${I18N}.detail.delete_value`)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </Tooltip>
          </>
        )}
      </span>
    </div>
  );
}
