import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Trash2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { AlertModalCore, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  FIELD_ICONS,
  requirementFieldKey,
  type TRequirementBinEntry,
} from "@/components/requirements/requirement-builder-items";

type TProps = {
  isOpen: boolean;
  onClose: () => void;
  entries: TRequirementBinEntry[];
  /** 字段 id -> 有非空值的需求条数（含子字段），来自配置接口的 field_value_counts */
  valueCounts: Record<string, number>;
  onRestore: (entry: TRequirementBinEntry) => void;
  /** 确认弹窗已经在这里弹过，调用方直接从草稿移除即可 */
  onDeleteForever: (entry: TRequirementBinEntry) => void;
};

const entryValueCount = (entry: TRequirementBinEntry, valueCounts: Record<string, number>) =>
  entry.field.id ? (valueCounts[entry.field.id] ?? 0) : 0;

const TABLE_COLUMNS = "grid min-h-72 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_5.5rem_max-content] gap-x-4";
const TABLE_ROW = "col-span-4 grid grid-cols-subgrid items-center px-4";

/**
 * 字段回收站弹窗：列出草稿里 is_active=false 的自定义字段，入口在字段库底部。
 * 移入/恢复只改草稿，「永久删除」也只是从草稿移除 —— 都要等页面「保存」才落库，
 * 所以这里没有任何请求，弹窗也没有 loading 态。恢复后弹窗保持打开，可以连续处理。
 *
 * 永久删除的确认框嵌在 ModalCore 的 children 里：Headless UI 只对 React 树内嵌套的
 * Dialog 做「点内层不关外层」处理，并列放会让点击确认框被当成外层的 outside click。
 */
export function RequirementFieldRecycleBin(props: TProps) {
  const { isOpen, onClose, entries, valueCounts, onRestore, onDeleteForever } = props;
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<TRequirementBinEntry | null>(null);
  // 面板里第一个可聚焦元素是右上角的关闭按钮，不指定的话打开后按回车就把弹窗关了
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const untitled = t("requirement_fields.fields.untitled");
  const entryPlainName = (entry: TRequirementBinEntry) =>
    entry.kind === "root"
      ? entry.field.name || untitled
      : `${entry.parent.name || untitled} › ${entry.field.name || untitled}`;
  const pendingCount = pendingDelete ? entryValueCount(pendingDelete, valueCounts) : 0;

  const handleClose = () => {
    setPendingDelete(null);
    onClose();
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXL}
      initialFocus={bodyRef}
    >
      <div className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-2 text-secondary">
            <Archive className="size-4" />
          </span>
          <h2 className="min-w-0 text-14 font-medium text-primary">{t("requirement_fields.recycle_bin.title")}</h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="grid size-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={bodyRef} tabIndex={-1} className="px-6 py-5 outline-none">
        {entries.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-subtle">
            <Archive className="size-6 text-placeholder" />
            <p className="text-12 text-tertiary">{t("requirement_fields.recycle_bin.empty")}</p>
          </div>
        ) : (
          <div className={cn(TABLE_COLUMNS, "overflow-hidden rounded-lg border border-subtle")}>
            <div className={cn(TABLE_ROW, "bg-layer-1/60 py-3 text-11 font-medium text-tertiary")}>
              <span>{t("requirement_fields.recycle_bin.column_name")}</span>
              <span>{t("requirement_fields.recycle_bin.column_type")}</span>
              <span>{t("requirement_fields.recycle_bin.column_values")}</span>
              <span>{t("requirement_fields.recycle_bin.column_actions")}</span>
            </div>
            {entries.map((entry) => {
              const count = entryValueCount(entry, valueCounts);
              const Icon = FIELD_ICONS[entry.field.field_type];
              return (
                <div
                  key={requirementFieldKey(entry.field)}
                  className={cn(TABLE_ROW, "border-t border-subtle py-3 text-13 hover:bg-layer-1-hover")}
                >
                  <span className="truncate font-medium text-primary">
                    {entry.kind === "child" && (
                      <span className="font-normal text-tertiary">{entry.parent.name || untitled} › </span>
                    )}
                    {entry.field.name || untitled}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-12 text-secondary">
                    <Icon className="size-3.5 shrink-0 text-tertiary" />
                    <span className="truncate">{t(`requirement_fields.field_types.${entry.field.field_type}`)}</span>
                  </span>
                  <span className={cn("text-12 tabular-nums", count > 0 ? "text-primary" : "text-tertiary")}>
                    {count > 0
                      ? t("requirement_fields.recycle_bin.value_count", { count })
                      : t("requirement_fields.recycle_bin.no_values")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => onRestore(entry)}>
                      <ArchiveRestore className="size-3.5" />
                      {t("restore")}
                    </Button>
                    <Button variant="link-danger" size="sm" onClick={() => setPendingDelete(entry)}>
                      <Trash2 className="size-3.5" />
                      {t("requirement_fields.recycle_bin.delete_permanently")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="sm" onClick={handleClose}>
          {t("close")}
        </Button>
      </div>

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        handleClose={() => setPendingDelete(null)}
        handleSubmit={() => {
          if (pendingDelete) onDeleteForever(pendingDelete);
          setPendingDelete(null);
        }}
        isSubmitting={false}
        variant="danger"
        title={t("requirement_fields.recycle_bin.delete_title")}
        content={
          pendingDelete
            ? t(
                pendingCount > 0
                  ? "requirement_fields.recycle_bin.delete_description_with_count"
                  : "requirement_fields.recycle_bin.delete_description",
                { name: entryPlainName(pendingDelete), count: pendingCount }
              )
            : ""
        }
        primaryButtonText={{
          default: t("requirement_fields.recycle_bin.delete_permanently"),
          loading: t("deleting"),
        }}
        secondaryButtonText={t("cancel")}
      />
    </ModalCore>
  );
}
