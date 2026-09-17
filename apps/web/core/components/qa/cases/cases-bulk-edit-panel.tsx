"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { globalEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { CaseService } from "@/services/qa/case.service";
import type { TCaseBulkUpdatePayload } from "@/services/qa/case.service";
import { qaCaseSetToastError } from "@/utils/qa-case-error";
import { useTranslation } from "@plane/i18n";
import type { TCaseTableRecord } from "./cases-table";
import { priorityDotClass } from "./update-modal/case-meta-form";

export type TCaseBulkChanges = Omit<TCaseBulkUpdatePayload, "cases_id">;

type TLabelOption = { id: string; name: string };
type TLabelOp = "add" | "remove";
type TLabelPresence = "all" | "some" | "none" | "unknown";

type TProps = {
  workspaceSlug: string;
  projectId?: string;
  repositoryId: string;
  selectedCount: number;
  /** 选中用例都在已加载的数据里时传入，用来标注当前值；有未加载的（跨页全选）传 null */
  knownCases: TCaseTableRecord[] | null;
  submitting: boolean;
  onCancel: () => void;
  onApply: (changes: TCaseBulkChanges) => void;
};

const caseService = new CaseService();

const KEEP_TEXT = "保持不变";

const enumOptions = (group: string, fallback: Record<string, string> = {}) =>
  Object.entries(((globalEnums.Enums as any)?.[group] as Record<string, string>) || fallback).map(
    ([value, label]) => ({ value: Number(value), label: String(label) })
  );

const recordLabelIds = (record: TCaseTableRecord) =>
  (record.labels || []).map((label) => (typeof label === "string" ? label : String(label?.id ?? "")));

/** 每一格下次点击后的状态：全有→移除；全无→添加；部分/未知→添加→移除 */
const nextLabelOp = (presence: TLabelPresence, current?: TLabelOp): TLabelOp | undefined => {
  if (presence === "all") return current ? undefined : "remove";
  if (presence === "none") return current ? undefined : "add";
  if (!current) return "add";
  return current === "add" ? "remove" : undefined;
};

export function CasesBulkEditPanel(props: TProps) {
  const { workspaceSlug, projectId, repositoryId, selectedCount, knownCases, submitting, onCancel, onApply } = props;
  const { t } = useTranslation();

  // undefined = 保持不变；assignee 的 null = 清空维护人
  const [assignee, setAssignee] = useState<string | null | undefined>(undefined);
  const [priority, setPriority] = useState<number | undefined>(undefined);
  const [caseType, setCaseType] = useState<number | undefined>(undefined);
  const [testType, setTestType] = useState<number | undefined>(undefined);
  const [labelOps, setLabelOps] = useState<Record<string, TLabelOp>>({});
  const [isLabelListOpen, setIsLabelListOpen] = useState(false);
  const [labels, setLabels] = useState<TLabelOption[] | null>(null);
  const [labelQuery, setLabelQuery] = useState("");

  const priorityOptions = useMemo(() => enumOptions("case_priority"), []);
  const typeOptions = useMemo(() => enumOptions("case_type"), []);
  const testTypeOptions = useMemo(() => enumOptions("case_test_type", { 0: "手动", 1: "自动" }), []);

  useEffect(() => {
    if (!isLabelListOpen || labels !== null) return;
    caseService
      .getCaseLabels(workspaceSlug, repositoryId)
      .then((data) =>
        setLabels((Array.isArray(data) ? data : []).map((label: any) => ({ id: String(label.id), name: label.name })))
      )
      .catch((error) => {
        setLabels([]);
        qaCaseSetToastError(error, t, "获取标签失败");
      });
  }, [isLabelListOpen, labels, workspaceSlug, repositoryId, t]);

  const countCurrent = (field: "priority" | "type", value: number) =>
    knownCases ? knownCases.filter((record) => record[field] === value).length : 0;

  const labelPresence = (labelId: string): { presence: TLabelPresence; count: number } => {
    if (!knownCases) return { presence: "unknown", count: 0 };
    const count = knownCases.filter((record) => recordLabelIds(record).includes(labelId)).length;
    if (count === 0) return { presence: "none", count };
    return { presence: count === knownCases.length ? "all" : "some", count };
  };

  const addLabelIds = Object.keys(labelOps).filter((id) => labelOps[id] === "add");
  const removeLabelIds = Object.keys(labelOps).filter((id) => labelOps[id] === "remove");
  const changedCount =
    [assignee, priority, caseType, testType].filter((value) => value !== undefined).length +
    (addLabelIds.length + removeLabelIds.length > 0 ? 1 : 0);

  const labelName = (id: string) => labels?.find((label) => label.id === id)?.name ?? "";
  const filteredLabels = (labels || []).filter((label) =>
    label.name.toLowerCase().includes(labelQuery.trim().toLowerCase())
  );
  const exactLabelExists = (labels || []).some((label) => label.name === labelQuery.trim());

  const handleCreateLabel = async () => {
    const name = labelQuery.trim();
    if (!name) return;
    try {
      const created: any = await caseService.createlabel(workspaceSlug, name, undefined, repositoryId);
      const label = { id: String(created.id), name: created.name };
      setLabels((prev) => [...(prev || []), label]);
      setLabelOps((prev) => ({ ...prev, [label.id]: "add" }));
      setLabelQuery("");
    } catch (error) {
      qaCaseSetToastError(error, t, "新建标签失败");
    }
  };

  const handleApply = () => {
    if (changedCount === 0) return;
    const changes: TCaseBulkChanges = {};
    if (assignee !== undefined) changes.assignee = assignee;
    if (priority !== undefined) changes.priority = priority;
    if (caseType !== undefined) changes.type = caseType;
    if (testType !== undefined) changes.test_type = testType;
    if (addLabelIds.length) changes.add_labels = addLabelIds;
    if (removeLabelIds.length) changes.remove_labels = removeLabelIds;
    onApply(changes);
  };

  const renderEnumField = (
    options: { value: number; label: string }[],
    value: number | undefined,
    onChange: (value: number | undefined) => void,
    field?: "priority" | "type",
    renderValue: (label: string) => ReactNode = (label) => label
  ) => {
    const selected = options.find((option) => option.value === value);
    return (
      <FieldShell isSet={value !== undefined} onReset={() => onChange(undefined)}>
        <CustomSelect
          value={value}
          onChange={(next: number) => onChange(next)}
          className="h-full min-w-0 flex-1"
          customButtonClassName="h-full w-full !justify-start !rounded-none !bg-transparent px-3 text-13 focus:outline-none"
          optionsClassName="z-[40] min-w-56"
          placement="top-start"
          customButton={
            <span className="flex w-full min-w-0 items-center gap-2">
              {selected ? (
                <span className="truncate text-primary">{renderValue(selected.label)}</span>
              ) : (
                <span className="truncate text-placeholder">{KEEP_TEXT}</span>
              )}
              {value === undefined && <ChevronDown className="ml-auto size-3.5 shrink-0 text-placeholder" />}
            </span>
          }
        >
          {options.map((option) => {
            const current = field ? countCurrent(field, option.value) : 0;
            return (
              <CustomSelect.Option key={option.value} value={option.value} className="text-13">
                <span className="flex w-full items-center gap-2">
                  {renderValue(option.label)}
                  {current > 0 && <span className="ml-auto text-11 text-tertiary">当前 {current} 条</span>}
                </span>
              </CustomSelect.Option>
            );
          })}
        </CustomSelect>
      </FieldShell>
    );
  };

  const renderPriority = (label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 shrink-0 rounded-full", priorityDotClass(label))} />
      {label}
    </span>
  );

  const labelSummary =
    addLabelIds.length + removeLabelIds.length === 0
      ? null
      : [...addLabelIds.map((id) => `+${labelName(id)}`), ...removeLabelIds.map((id) => `−${labelName(id)}`)].join(
          "  "
        );

  return (
    <div
      className="w-[400px] max-w-[calc(100vw-2rem)] rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
      role="dialog"
      aria-label="批量修改属性"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="px-4 pt-4 pb-2 text-body-sm-medium text-primary">修改 {selectedCount} 条用例的属性</div>

      <div className="flex flex-col gap-2 px-4 py-1">
        <FieldRow label="维护人">
          <FieldShell isSet={assignee !== undefined} onReset={() => setAssignee(undefined)}>
            {assignee === null ? (
              <span className="flex-1 px-3 text-13 text-primary">无维护人</span>
            ) : (
              <MemberDropdown
                multiple={false}
                projectId={projectId}
                value={assignee ?? null}
                onChange={(val) => setAssignee(val ?? undefined)}
                placeholder={KEEP_TEXT}
                className="h-full min-w-0 flex-1"
                buttonContainerClassName="h-full w-full text-left"
                buttonVariant="transparent-with-text"
                buttonClassName={cn(
                  "h-full w-full justify-start rounded-none px-3 text-13 hover:bg-transparent",
                  assignee ? "text-primary" : "text-placeholder"
                )}
                dropdownArrow={false}
                showUserDetails
                placement="top-start"
                optionsClassName="z-[40]"
              />
            )}
            {assignee === undefined && (
              <button
                type="button"
                className="mr-2 shrink-0 rounded px-1.5 py-0.5 text-11 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
                onClick={() => setAssignee(null)}
              >
                设为无
              </button>
            )}
          </FieldShell>
        </FieldRow>

        <FieldRow label="优先级">
          {renderEnumField(priorityOptions, priority, setPriority, "priority", renderPriority)}
        </FieldRow>
        <FieldRow label="用例类型">{renderEnumField(typeOptions, caseType, setCaseType, "type")}</FieldRow>
        <FieldRow label="测试类型">{renderEnumField(testTypeOptions, testType, setTestType)}</FieldRow>

        <FieldRow label="标签">
          <FieldShell isSet={labelSummary !== null} onReset={() => setLabelOps({})}>
            <button
              type="button"
              className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-13"
              onClick={() => setIsLabelListOpen((open) => !open)}
              aria-expanded={isLabelListOpen}
            >
              <span className={cn("truncate", labelSummary ? "text-primary" : "text-placeholder")}>
                {labelSummary ?? KEEP_TEXT}
              </span>
              {labelSummary === null && (
                <ChevronDown
                  className={cn(
                    "ml-auto size-3.5 shrink-0 text-placeholder transition-transform",
                    isLabelListOpen && "rotate-180"
                  )}
                />
              )}
            </button>
          </FieldShell>
        </FieldRow>

        {isLabelListOpen && (
          <div className="ml-[84px] rounded-md border border-subtle bg-surface-2 p-1.5">
            <div className="flex h-8 items-center gap-2 rounded bg-surface-1 px-2">
              <Search className="size-3.5 shrink-0 text-placeholder" />
              <input
                id="cases-bulk-label-search"
                value={labelQuery}
                onChange={(e) => setLabelQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && labelQuery.trim() && !exactLabelExists) {
                    e.preventDefault();
                    handleCreateLabel();
                  }
                }}
                placeholder="搜索或新建标签"
                className="w-full bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
              />
            </div>
            <div className="mt-1 max-h-44 overflow-y-auto">
              {labels === null && <p className="px-2 py-1.5 text-13 text-placeholder">加载中…</p>}
              {filteredLabels.map((label) => {
                const { presence, count } = labelPresence(label.id);
                const op = labelOps[label.id];
                const checked = op ? op === "add" : presence === "all";
                const indeterminate = !op && presence === "some";
                const hint =
                  op === "add"
                    ? "将添加"
                    : op === "remove"
                      ? "将移除"
                      : presence === "all"
                        ? `${count} 条都有`
                        : presence === "some"
                          ? `其中 ${count} 条`
                          : "";
                return (
                  <button
                    key={label.id}
                    type="button"
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-13 text-primary hover:bg-layer-transparent-hover"
                    aria-pressed={checked}
                    onClick={() =>
                      setLabelOps((prev) => {
                        const next = { ...prev };
                        const nextOp = nextLabelOp(presence, prev[label.id]);
                        if (nextOp) next[label.id] = nextOp;
                        else delete next[label.id];
                        return next;
                      })
                    }
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                        checked || indeterminate
                          ? "border-accent-primary bg-accent-primary text-on-color"
                          : "border-strong bg-surface-1"
                      )}
                    >
                      {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
                      {indeterminate ? <Minus className="size-2.5" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate">{label.name}</span>
                    {hint && (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-11",
                          op === "add" ? "text-accent-primary" : op === "remove" ? "text-danger-primary" : "text-tertiary"
                        )}
                      >
                        {hint}
                      </span>
                    )}
                  </button>
                );
              })}
              {labels !== null && labelQuery.trim() && !exactLabelExists && (
                <button
                  type="button"
                  className="flex h-8 w-full items-center gap-1.5 rounded px-2 text-left text-13 text-accent-primary hover:bg-layer-transparent-hover"
                  onClick={handleCreateLabel}
                >
                  <Plus className="size-3.5" />
                  新建标签「{labelQuery.trim()}」
                </button>
              )}
              {labels !== null && labels.length === 0 && !labelQuery.trim() && (
                <p className="px-2 py-1.5 text-13 text-placeholder">这个库还没有标签，输入名称新建</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-subtle px-4 py-3">
        <span className="mr-auto text-11 text-tertiary">{changedCount > 0 ? `已改 ${changedCount} 项` : ""}</span>
        <Button variant="secondary" size="lg" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button variant="primary" size="lg" onClick={handleApply} disabled={changedCount === 0} loading={submitting}>
          应用到 {selectedCount} 条
        </Button>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-13 text-secondary">{label}</span>
      {children}
    </div>
  );
}

function FieldShell({ isSet, onReset, children }: { isSet: boolean; onReset: () => void; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-9 min-w-0 flex-1 items-center rounded-md border transition-colors",
        isSet ? "border-accent-strong bg-accent-subtle" : "border-subtle bg-surface-1 hover:border-strong"
      )}
    >
      {children}
      {isSet && (
        <button
          type="button"
          className="mr-2 flex size-5 shrink-0 items-center justify-center rounded-full text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
          onClick={onReset}
          aria-label="改回保持不变"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
