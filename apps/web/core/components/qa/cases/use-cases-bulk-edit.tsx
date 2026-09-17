"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "@plane/i18n";
import { CaseService } from "@/services/qa/case.service";
import { qaCaseSetToastError, qaCaseSetToastSuccess } from "@/utils/qa-case-error";
import type { TCaseDisplayPropertyKey } from "./cases-display-filters";
import type { TCaseBulkChanges } from "./cases-bulk-edit-panel";
import type { TCaseTableRecord } from "./cases-table";

type TParams = {
  isTemplateMode: boolean;
  workspaceSlug: string;
  projectId?: string;
  cases: TCaseTableRecord[];
  selectedCaseIds: string[];
  clearSelection: () => void;
  /** 更新成功后刷新列表 */
  onUpdated: () => Promise<void> | void;
};

const caseService = new CaseService();

const FLASH_MS = 1600;

const CHANGE_NAMES: { key: keyof TCaseBulkChanges; name: string; column?: TCaseDisplayPropertyKey }[] = [
  { key: "assignee", name: "维护人", column: "assignee" },
  { key: "priority", name: "优先级", column: "priority" },
  { key: "type", name: "用例类型", column: "type" },
  { key: "test_type", name: "测试类型" },
];

const describeChanges = (changes: TCaseBulkChanges) => {
  const names = CHANGE_NAMES.filter((item) => changes[item.key] !== undefined).map((item) => item.name);
  if (changes.add_labels?.length || changes.remove_labels?.length) names.push("标签");
  return names;
};

/** 用例列表「修改属性」：面板开关、已知当前值、跨页确认、提交与格子高亮 */
export const useCasesBulkEdit = (params: TParams) => {
  const { isTemplateMode, workspaceSlug, projectId, cases, selectedCaseIds, clearSelection, onUpdated } = params;
  const { t } = useTranslation();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flashedCells, setFlashedCells] = useState<{
    ids: Set<string>;
    columns: Set<TCaseDisplayPropertyKey>;
  } | null>(null);
  // 翻页勾选时记住见过的用例，面板才能标出选中用例的当前值
  const seenCasesRef = useRef(new Map<string, TCaseTableRecord>());

  useEffect(() => {
    cases.forEach((record) => seenCasesRef.current.set(String(record.id), record));
  }, [cases]);

  useEffect(() => {
    if (selectedCaseIds.length === 0) setIsPanelOpen(false);
  }, [selectedCaseIds.length]);

  useEffect(() => {
    if (!flashedCells) return;
    const timer = window.setTimeout(() => setFlashedCells(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashedCells]);

  const knownCases = useMemo(() => {
    if (!isPanelOpen) return null;
    const records = selectedCaseIds.map((id) => seenCasesRef.current.get(String(id)));
    return records.every(Boolean) ? (records as TCaseTableRecord[]) : null;
  }, [isPanelOpen, selectedCaseIds]);

  const submit = async (changes: TCaseBulkChanges) => {
    const ids = [...selectedCaseIds];
    setSubmitting(true);
    try {
      const payload = { cases_id: ids, ...changes };
      const result = isTemplateMode
        ? await caseService.bulkUpdateTemplateCases(workspaceSlug, payload)
        : await caseService.bulkUpdateCases(workspaceSlug, String(projectId), payload);
      qaCaseSetToastSuccess(`${describeChanges(changes).join("、")}`, `已更新 ${result?.updated ?? ids.length} 条用例`);
      setIsPanelOpen(false);
      clearSelection();
      await onUpdated();
      const columns = new Set<TCaseDisplayPropertyKey>(
        CHANGE_NAMES.filter((item) => item.column && changes[item.key] !== undefined).map(
          (item) => item.column as TCaseDisplayPropertyKey
        )
      );
      if (changes.add_labels?.length || changes.remove_labels?.length) columns.add("labels");
      setFlashedCells({ ids: new Set(ids.map(String)), columns });
    } catch (error) {
      qaCaseSetToastError(error, t, "批量修改失败");
    } finally {
      setSubmitting(false);
    }
  };

  const apply = (changes: TCaseBulkChanges) => {
    const pageIds = new Set(cases.map((record) => String(record.id)));
    const beyondPage = selectedCaseIds.some((id) => !pageIds.has(String(id)));
    if (!beyondPage) {
      submit(changes);
      return;
    }
    Modal.confirm({
      title: `修改全部 ${selectedCaseIds.length} 条用例？`,
      content: `选中的用例不止当前页，将修改它们的${describeChanges(changes).join("、")}。`,
      okText: "确认修改",
      cancelText: "取消",
      zIndex: 1250,
      onOk: () => submit(changes),
    });
  };

  return {
    isPanelOpen,
    togglePanel: () => setIsPanelOpen((open) => !open),
    closePanel: () => setIsPanelOpen(false),
    submitting,
    knownCases,
    flashedCells,
    apply,
  };
};
