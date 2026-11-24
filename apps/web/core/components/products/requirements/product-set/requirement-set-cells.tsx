import { Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductSet, TRequirement, TRequirementSource } from "@plane/types";
import { cn } from "@plane/utils";

const I18N = "workspace_product_sets.requirements";
/** 「使用范围」格里最多直接列出的开发编号个数，其余收成 +N */
const MAX_SCOPE_CHIPS = 3;
const CHIP = "inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-12 whitespace-nowrap tabular-nums";

/** 产品集需求的「使用范围」格：引用它的产品的开发编号；勾满显示「全部产品」。onEdit 传了才能点开改。 */
export function RequirementScopeCell(props: {
  requirement: TRequirement;
  members: TProductSet["products"];
  onEdit?: (requirement: TRequirement) => void;
}) {
  const { requirement, members, onEdit } = props;
  const { t } = useTranslation();
  const scopeIds = new Set(requirement.scope_product_ids ?? []);
  const inScope = members.filter((member) => scopeIds.has(member.id));
  const hidden = inScope.length - MAX_SCOPE_CHIPS;

  const content =
    inScope.length === 0 ? (
      <span className="text-13 text-tertiary">{t(`${I18N}.scope_empty`)}</span>
    ) : inScope.length === members.length ? (
      <span className={cn(CHIP, "bg-accent-subtle font-medium text-accent-primary")}>{t(`${I18N}.scope_all`)}</span>
    ) : (
      <>
        {inScope.slice(0, MAX_SCOPE_CHIPS).map((member) => (
          <span key={member.id} title={member.name} className={cn(CHIP, "border border-subtle text-primary")}>
            {member.identifier}
          </span>
        ))}
        {hidden > 0 && <span className={cn(CHIP, "bg-layer-1 text-secondary")}>+{hidden}</span>}
      </>
    );

  if (!onEdit) return <span className="flex items-center gap-1.5 overflow-hidden">{content}</span>;
  return (
    <button
      type="button"
      onClick={() => onEdit(requirement)}
      aria-label={t(`${I18N}.scope`)}
      className="-mx-1.5 flex h-7 w-[calc(100%+12px)] items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-left hover:bg-layer-transparent-hover"
    >
      {content}
    </button>
  );
}

/** 产品需求的「来源」格：自有 / 产品集（引用）/ 转自 MP01-7（转为自有） */
export function RequirementSourceCell({ requirement }: { requirement: TRequirement }) {
  const { t } = useTranslation();
  if (requirement.is_reference)
    return (
      <span className={cn(CHIP, "gap-1 bg-accent-subtle pl-1.5 font-medium text-accent-primary")}>
        <Layers className="size-3" />
        {t(`${I18N}.source_set`)}
      </span>
    );
  if (requirement.origin_display_id)
    return (
      <span className={cn(CHIP, "bg-layer-1 text-secondary")}>
        {t(`${I18N}.source_converted`, { id: requirement.origin_display_id })}
      </span>
    );
  return <span className="text-13 text-secondary">{t(`${I18N}.source_own`)}</span>;
}

/** 产品需求的「操作」格：引用的行可以转为自有 */
export function RequirementConvertCell(props: {
  requirement: TRequirement;
  onConvert?: (requirement: TRequirement) => void;
}) {
  const { requirement, onConvert } = props;
  const { t } = useTranslation();
  if (!requirement.is_reference || !onConvert) return <span className="text-placeholder">—</span>;
  return (
    <button
      type="button"
      className="text-13 font-medium text-accent-primary hover:underline"
      onClick={() => onConvert(requirement)}
    >
      {t(`${I18N}.convert`)}
    </button>
  );
}

/** 产品需求页的「全部 / 自有 / 引用」分段（产品属于某个产品集时才出） */
export function RequirementSourceSwitcher(props: {
  value: TRequirementSource | undefined;
  counts: { all: number; own: number; referenced: number };
  onChange: (value: TRequirementSource | undefined) => void;
}) {
  const { value, counts, onChange } = props;
  const { t } = useTranslation();
  const options: { key: TRequirementSource | undefined; label: string; count: number }[] = [
    { key: undefined, label: t(`${I18N}.source_all`), count: counts.all },
    { key: "own", label: t(`${I18N}.source_own`), count: counts.own },
    { key: "referenced", label: t(`${I18N}.source_referenced`), count: counts.referenced },
  ];
  return (
    <div className="inline-flex shrink-0 gap-0.5 rounded-lg bg-layer-1 p-[3px]" role="tablist">
      {options.map((option) => {
        const isActive = option.key === value;
        return (
          <button
            key={option.key ?? "all"}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-13 whitespace-nowrap",
              isActive ? "bg-surface-1 font-medium text-primary shadow-sm" : "text-secondary hover:text-primary"
            )}
          >
            {option.label}
            <span className="text-12 font-normal text-tertiary tabular-nums">{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}
