import { GripVertical, Hash, Lock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementBuiltinKey } from "@plane/types";
import { cn } from "@plane/utils";
import { REQUIREMENT_BUILTIN_COLUMNS } from "./requirement-builtin-fields";

type TProps = {
  /** "code" 不是内置列（库条目手填编号），只在这里作为锁定展示行出现 */
  columnKey: TRequirementBuiltinKey | "code";
  /** 编号/标题：锁定在列表最前，无拖拽把手（渲染锁图标占位保持对齐） */
  pinned?: boolean;
  /** 可勾选行的当前值；锁定行由注册表的 libraryLock 决定，不看这里 */
  showInLibrary?: boolean;
  /** 不传 ⇒ 勾选框锁定（title/code 恒勾选、status 恒不勾） */
  onToggleShowInLibrary?: (next: boolean) => void;
};

/**
 * 字段结构页里的内置字段行：与自定义字段行（RequirementFieldRow）混排在同一列表。
 * 定义不可修改 —— 点击不展开编辑表单、没有三点菜单；行上唯一可交互的是
 * 「纳入标准库」勾选框（且仅非必填、非 status 的行可改）。
 */
export function RequirementBuiltinFieldRow(props: TProps) {
  const { columnKey, pinned = false, showInLibrary, onToggleShowInLibrary } = props;
  const { t } = useTranslation();

  const column = REQUIREMENT_BUILTIN_COLUMNS.find((item) => item.key === columnKey);
  const Icon = columnKey === "code" ? Hash : (column?.icon ?? Hash);
  const label = columnKey === "code" ? t("requirements.identifier.column") : t(column?.labelKey ?? "");
  const typeLabel = t(columnKey === "code" ? "requirement_fields.field_types.text" : (column?.typeLabelKey ?? ""));
  // 编号/标题是必填的结构列，恒纳入标准库；status 恒不纳入 —— 两端都锁死勾选框
  const isLibraryLocked = pinned || columnKey === "code" || column?.libraryLock !== undefined;
  const isChecked =
    columnKey === "code" || column?.libraryLock === "in"
      ? true
      : column?.libraryLock === "out"
        ? false
        : Boolean(showInLibrary);

  return (
    <div className="overflow-hidden rounded-md border border-strong bg-surface-1 transition hover:border-accent-primary/40">
      <div
        className="flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-layer-1-hover"
        title={t("requirement_fields.builder.builtin_locked_hint")}
      >
        {pinned ? (
          <span className="grid size-5 shrink-0 place-items-center text-tertiary">
            <Lock className="size-3.5" />
          </span>
        ) : (
          <span
            data-sortable-drag-handle
            className="grid size-5 shrink-0 cursor-grab place-items-center text-tertiary active:cursor-grabbing"
          >
            <GripVertical className="size-4 pointer-events-none" />
          </span>
        )}
        <span className="grid size-6 shrink-0 place-items-center rounded border border-subtle bg-layer-1 text-secondary">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-primary">
          {label}
          {pinned && (
            <span className="ml-1 font-normal text-secondary">({t("requirement_fields.fields.required")})</span>
          )}
        </span>
        <span className="inline-flex shrink-0 items-center rounded border border-subtle bg-surface-2 px-2 py-0.5 text-11 font-medium text-secondary">
          {t("requirement_fields.builder.builtin_badge")}
        </span>
        <label
          className={cn(
            "flex shrink-0 items-center gap-2 text-12 text-secondary",
            isLibraryLocked && "cursor-not-allowed text-disabled"
          )}
          // 勾选框锁定的理由：必填列恒纳入；status 是交付状态，模板上没有意义
          title={isLibraryLocked ? t("requirement_fields.builtin.locked_hint") : undefined}
        >
          <input
            type="checkbox"
            checked={isChecked}
            disabled={isLibraryLocked || !onToggleShowInLibrary}
            onChange={(event) => onToggleShowInLibrary?.(event.target.checked)}
            className="size-3.5 rounded border border-subtle accent-accent-primary disabled:cursor-not-allowed"
          />
          {t("requirement_fields.builder.library_title")}
        </label>
        <span className="shrink-0 text-xs text-secondary">{typeLabel}</span>
      </div>
    </div>
  );
}
