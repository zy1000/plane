"use client";

/**
 * 「对比两版」：任选两版并排看差异。默认选相邻的最新两版；两个下拉不分先后，
 * 确认时按版本号自动排成「较早 → 较新」，同一版不给比。
 */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTypeSchema, TRequirementVersion } from "@plane/types";
import { Button } from "@plane/propel/button";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { ChangeRequestRequirementDiff } from "@/components/products/requirements/change/change-request-requirement-diff";
import { buildVersionDiffItem } from "./requirement-history-model";
import { formatHistoryDate, HistoryPill } from "./requirement-history-timeline";

const SELECT_BUTTON = "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-strong bg-surface-1 px-2.5 text-body-xs-regular text-primary";

export const RequirementHistoryComparePanel = ({
  versions,
  approvedVersion,
  requirementType,
  workspaceSlug,
  onClose,
}: {
  /** 新版在前 */
  versions: TRequirementVersion[];
  approvedVersion: number | null;
  requirementType: TRequirementTypeSchema | null;
  workspaceSlug: string;
  onClose: () => void;
}) => {
  const { t, currentLocale } = useTranslation();
  const [fromNumber, setFromNumber] = useState<number>(versions[1]?.version ?? versions[0]?.version);
  const [toNumber, setToNumber] = useState<number>(versions[0]?.version);
  const [confirmed, setConfirmed] = useState<{ from: number; to: number } | null>(null);

  const byNumber = useMemo(() => new Map(versions.map((version) => [version.version, version])), [versions]);
  const optionLabel = (version: TRequirementVersion) =>
    t("requirement_detail.history.compare.option", {
      version: version.version,
      date: formatHistoryDate(version.created_at, currentLocale),
    });

  const selected = confirmed
    ? { from: byNumber.get(confirmed.from) ?? null, to: byNumber.get(confirmed.to) ?? null }
    : null;

  const renderSelect = (value: number, onChange: (next: number) => void) => (
    <CustomSelect
      value={value}
      onChange={onChange}
      customButton={
        <span className={SELECT_BUTTON}>
          <span className="truncate">{byNumber.get(value) ? optionLabel(byNumber.get(value)!) : "—"}</span>
          {value === approvedVersion && (
            <HistoryPill tone="version" className="h-[18px]">
              {t("requirement_detail.history.current_version")}
            </HistoryPill>
          )}
        </span>
      }
      customButtonClassName="w-full"
      maxHeight="lg"
    >
      {versions.map((version) => (
        <CustomSelect.Option key={version.id} value={version.version}>
          <span className="flex items-center gap-2 tabular-nums">
            {optionLabel(version)}
            {version.version === approvedVersion && (
              <span className="text-caption-md-regular text-tertiary">{t("requirement_detail.history.current_version")}</span>
            )}
          </span>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-2 p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <div className="flex flex-col gap-1 text-caption-md-regular text-tertiary">
          <span>{t("requirement_detail.history.compare.from")}</span>
          {renderSelect(fromNumber, setFromNumber)}
        </div>
        <span className="pb-2 text-placeholder">→</span>
        <div className="flex flex-col gap-1 text-caption-md-regular text-tertiary">
          <span>{t("requirement_detail.history.compare.to")}</span>
          {renderSelect(toNumber, setToNumber)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption-md-regular text-placeholder">{t("requirement_detail.history.compare.hint")}</span>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="size-3" />
            {t("requirement_detail.history.compare.close")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={fromNumber === toNumber}
            onClick={() =>
              setConfirmed({ from: Math.min(fromNumber, toNumber), to: Math.max(fromNumber, toNumber) })
            }
          >
            {t("requirement_detail.history.compare.confirm")}
          </Button>
        </div>
      </div>
      {selected?.from && selected.to && (
        <div className={cn("flex flex-col gap-2 border-t border-subtle pt-3")}>
          <span className="text-body-xs-medium text-primary tabular-nums">
            {t("requirement_detail.history.compare.title", { from: selected.from.version, to: selected.to.version })}
          </span>
          <ChangeRequestRequirementDiff
            item={buildVersionDiffItem(selected.from, selected.to, requirementType?.name ?? "")}
            fields={selected.to.fields_snapshot ?? []}
            builtinLayout={requirementType?.builtin_fields ?? null}
            workspaceSlug={workspaceSlug}
          />
        </div>
      )}
    </div>
  );
};
