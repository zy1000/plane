import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TStageReviewBulkChanges } from "@plane/types";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { BulkEditFieldRow, BulkEditFieldShell } from "@/components/common/bulk-edit-field";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

const I18N = "stage_review";

/** undefined = 保持不变；null = 清空 */
type TFieldValue = string | null | undefined;

/** 字段里「清空 / 设为无」那个小按钮，只在保持不变时出现 */
const ClearButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    className="mr-2 shrink-0 rounded px-1.5 py-0.5 text-11 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
    onClick={onClick}
  >
    {label}
  </button>
);

const ClearedValue = ({ children }: { children: ReactNode }) => (
  <span className="flex-1 px-3 text-13 text-primary">{children}</span>
);

/**
 * 阶段评审列表勾选后的「修改属性」浮层：负责人 / 审核人 / 开始日期 / 结束日期。
 *
 * 口径同用例的批量面板：每项默认「保持不变」，改过的换强调色边框并带 × 改回；成员可「设为无」，
 * 日期可「清空」。暂存后一次「应用到 N 条」。候选人是本项目成员 —— 一批评审的角色名各不相同，
 * 没法像抽屉那样按产品角色筛。
 */
export const StageReviewBulkEditPanel = ({
  projectId,
  selectedCount,
  submitting,
  onCancel,
  onApply,
}: {
  projectId: string;
  selectedCount: number;
  submitting: boolean;
  onCancel: () => void;
  onApply: (changes: TStageReviewBulkChanges) => void;
}) => {
  const { t } = useTranslation();
  const [leader, setLeader] = useState<TFieldValue>(undefined);
  const [auditor, setAuditor] = useState<TFieldValue>(undefined);
  const [startDate, setStartDate] = useState<TFieldValue>(undefined);
  const [endDate, setEndDate] = useState<TFieldValue>(undefined);

  const keepText = t(`${I18N}.bulk.keep_unchanged`);
  const resetLabel = t(`${I18N}.bulk.reset`);
  const changedCount = [leader, auditor, startDate, endDate].filter((value) => value !== undefined).length;

  const handleApply = () => {
    if (changedCount === 0) return;
    const changes: TStageReviewBulkChanges = {};
    if (leader !== undefined) changes.leader = leader;
    if (auditor !== undefined) changes.auditor = auditor;
    if (startDate !== undefined) changes.start_date = startDate;
    if (endDate !== undefined) changes.end_date = endDate;
    onApply(changes);
  };

  const renderMember = (value: TFieldValue, onChange: (value: TFieldValue) => void) => (
    <BulkEditFieldShell isSet={value !== undefined} onReset={() => onChange(undefined)} resetLabel={resetLabel}>
      {value === null ? (
        <ClearedValue>{t(`${I18N}.list.unassigned`)}</ClearedValue>
      ) : (
        <MemberDropdown
          multiple={false}
          projectId={projectId}
          value={value ?? null}
          onChange={(next) => onChange(next ?? undefined)}
          placeholder={keepText}
          className="h-full min-w-0 flex-1"
          buttonContainerClassName="h-full w-full text-left"
          buttonVariant="transparent-with-text"
          buttonClassName={cn(
            "h-full w-full justify-start rounded-none px-3 text-13 hover:bg-transparent",
            value ? "text-primary" : "text-placeholder"
          )}
          dropdownArrow={false}
          showUserDetails
          placement="top-start"
          optionsClassName="z-[40]"
        />
      )}
      {value === undefined && <ClearButton label={t(`${I18N}.bulk.set_none`)} onClick={() => onChange(null)} />}
    </BulkEditFieldShell>
  );

  const renderDate = (
    value: TFieldValue,
    onChange: (value: TFieldValue) => void,
    bounds: { minDate?: TFieldValue; maxDate?: TFieldValue }
  ) => (
    <BulkEditFieldShell isSet={value !== undefined} onReset={() => onChange(undefined)} resetLabel={resetLabel}>
      {value === null ? (
        <ClearedValue>{t(`${I18N}.bulk.none_date`)}</ClearedValue>
      ) : (
        <DateDropdown
          value={value ?? null}
          minDate={getDate(bounds.minDate ?? undefined)}
          maxDate={getDate(bounds.maxDate ?? undefined)}
          onChange={(next) => onChange(next ? renderFormattedPayloadDate(next) : undefined)}
          placeholder={keepText}
          className="h-full min-w-0 flex-1"
          buttonContainerClassName="h-full w-full text-left"
          buttonVariant="transparent-with-text"
          buttonClassName={cn(
            "h-full w-full justify-start rounded-none px-3 text-13 hover:bg-transparent",
            value ? "text-primary" : "text-placeholder"
          )}
          placement="top-start"
          optionsClassName="z-[40]"
          hideIcon
          isClearable={false}
        />
      )}
      {value === undefined && <ClearButton label={t(`${I18N}.bulk.clear_date`)} onClick={() => onChange(null)} />}
    </BulkEditFieldShell>
  );

  return (
    <div
      className="w-[400px] max-w-[calc(100vw-2rem)] rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
      role="dialog"
      aria-label={t(`${I18N}.bulk.edit_properties`)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div className="px-4 pt-4 pb-2 text-body-sm-medium text-primary">
        {t(`${I18N}.bulk.panel_title`, { count: selectedCount })}
      </div>

      <div className="flex flex-col gap-2 px-4 py-1">
        <BulkEditFieldRow label={t(`${I18N}.fields.leader`)}>{renderMember(leader, setLeader)}</BulkEditFieldRow>
        <BulkEditFieldRow label={t(`${I18N}.fields.auditor`)}>{renderMember(auditor, setAuditor)}</BulkEditFieldRow>
        <BulkEditFieldRow label={t(`${I18N}.fields.start_date`)}>
          {renderDate(startDate, setStartDate, { maxDate: endDate })}
        </BulkEditFieldRow>
        <BulkEditFieldRow label={t(`${I18N}.fields.end_date`)}>
          {renderDate(endDate, setEndDate, { minDate: startDate })}
        </BulkEditFieldRow>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-subtle px-4 py-3">
        <span className="mr-auto text-11 text-tertiary">
          {changedCount > 0 ? t(`${I18N}.bulk.changed_count`, { count: changedCount }) : ""}
        </span>
        <Button variant="secondary" size="lg" onClick={onCancel} disabled={submitting}>
          {t(`${I18N}.bulk.cancel`)}
        </Button>
        <Button variant="primary" size="lg" onClick={handleApply} disabled={changedCount === 0} loading={submitting}>
          {t(`${I18N}.bulk.apply`, { count: selectedCount })}
        </Button>
      </div>
    </div>
  );
};
