"use client";

import React from "react";
import { Modal, Select, Spin, Tag } from "antd";
import { useParams } from "next/navigation";
import { Maximize2, X } from "lucide-react";
import { CaseService } from "../../../../services/qa/case.service";
import { RichTextEditor, formatCNDateTime } from "../util";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type TCaseVersionItem = { id: string; version: number; created_at?: string };

type EnumsData = {
  case_test_type?: Record<string, string>;
  case_type?: Record<string, string>;
  case_priority?: Record<string, string>;
  case_state?: Record<string, string>;
  plan_case_result?: Record<string, string>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  caseId: string;
  caseVersions: TCaseVersionItem[];
  latestVersion?: number;
  currentVersionLabel: string;
  enumsData?: EnumsData;
  width?: number;
  height?: number | string;
};

export function CaseVersionCompareModal({
  open,
  onClose,
  workspaceSlug,
  caseId,
  caseVersions,
  latestVersion,
  currentVersionLabel,
  enumsData,
  width = 920,
  height = "70vh",
}: Props) {
  const { projectId } = useParams() as { projectId?: string };
  const { setPeekIssue } = useIssueDetail();
  const caseService = React.useMemo(() => new CaseService(), []);

  const [compareBaseVersion, setCompareBaseVersion] = React.useState<number | undefined>(undefined);
  const [compareData, setCompareData] = React.useState<any>(null);
  const [loadingCompare, setLoadingCompare] = React.useState(false);

  const historyVersionOptions = React.useMemo(() => {
    const latest = latestVersion;
    const list = (caseVersions || [])
      .filter((v) => latest === undefined || Number(v.version) !== latest)
      .sort((a, b) => Number(b.version) - Number(a.version));
    return list.map((v) => {
      const createdAt = v.created_at ? formatCNDateTime(v.created_at) : "";
      const label = createdAt ? `v${Number(v.version)} · ${createdAt}` : `v${Number(v.version)}`;
      return { value: Number(v.version), label };
    });
  }, [caseVersions, latestVersion]);

  const fetchCompare = React.useCallback(
    async (baseVersion: number) => {
      if (!workspaceSlug || !caseId) return;
      if (latestVersion === undefined) return;
      setLoadingCompare(true);
      try {
        const res = await caseService.compareCaseVersions(String(workspaceSlug), String(caseId), baseVersion, latestVersion);
        setCompareData(res);
      } catch {
        setCompareData(null);
      } finally {
        setLoadingCompare(false);
      }
    },
    [workspaceSlug, caseId, latestVersion, caseService]
  );

  React.useEffect(() => {
    if (!open) return;
    if (latestVersion === undefined) return;
    if (compareBaseVersion === undefined) return;
    fetchCompare(compareBaseVersion);
  }, [open, latestVersion, historyVersionOptions, compareBaseVersion, fetchCompare]);

  React.useEffect(() => {
    if (open) return;
    setCompareBaseVersion(undefined);
    setCompareData(null);
    setLoadingCompare(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (historyVersionOptions.length === 0) return;
    const v = historyVersionOptions[0]?.value;
    if (v === undefined) return;
    setCompareBaseVersion(v);
    setCompareData(null);
  }, [open, historyVersionOptions]);

  const enumLabel = React.useCallback(
    (field: string, value: any): string | undefined => {
      const key = value === null || value === undefined ? undefined : String(value);
      if (!key) return undefined;
      if (field === "type") return (enumsData?.case_type || {})[key];
      if (field === "priority") return (enumsData?.case_priority || {})[key];
      if (field === "state") return (enumsData?.case_state || {})[key];
      if (field === "test_type") return (enumsData?.case_test_type || {})[key];
      return undefined;
    },
    [enumsData]
  );

  const renderValue = React.useCallback(
    (item: any, side: "from" | "to") => {
      const field = String(item?.field || "");
      const value = side === "from" ? item?.from : item?.to;
      if (value === null || value === undefined) return <span className="text-gray-400">-</span>;

      if (field === "type" || field === "priority" || field === "state" || field === "test_type") {
        const label = enumLabel(field, value);
        return <span className="text-sm">{label ?? String(value)}</span>;
      }

      if (field === "label_ids") {
        const list = side === "from" ? item?.from_display : item?.to_display;
        const items = Array.isArray(list) ? list : [];
        if (items.length === 0) return <span className="text-gray-400">-</span>;
        return (
          <div className="flex flex-wrap gap-2">
            {items.map((l: any) => (
              <Tag key={String(l?.id ?? l?.name ?? "")} className="m-0">
                {String(l?.name ?? l?.id ?? "-")}
              </Tag>
            ))}
          </div>
        );
      }

      if (field === "issue_ids") {
        const grouped = side === "from" ? item?.from_display_grouped : item?.to_display_grouped;
        const groupOrder = ["产品需求", "工作项", "缺陷"];
        const hasGrouped =
          grouped && typeof grouped === "object" && groupOrder.some((k) => Array.isArray((grouped as any)[k]));
        const itemsByGroup: Record<string, any[]> = hasGrouped
          ? (grouped as any)
          : {
              产品需求: [],
              工作项: Array.isArray(side === "from" ? item?.from_display : item?.to_display)
                ? (side === "from" ? item?.from_display : item?.to_display)
                : [],
              缺陷: [],
            };
        const total = groupOrder.reduce((sum, k) => sum + ((itemsByGroup[k] || []).length as number), 0);
        if (total === 0) return <span className="text-gray-400">-</span>;
        return (
          <div className="space-y-2">
            {groupOrder.map((g) => {
              const list = Array.isArray(itemsByGroup[g]) ? itemsByGroup[g] : [];
              if (list.length === 0) return null;
              return (
                <div key={g}>
                  <div className="text-xs text-gray-600 mb-1">{g}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((it: any) => {
                      const text = String(it?.name ?? it?.id ?? "-");
                      const issueId = it?.id ? String(it.id) : "";
                      const projectId = it?.project_id ? String(it.project_id) : "";
                      const isArchived = Boolean(it?.is_archived);
                      return (
                        <Tag
                          key={String(it?.id ?? text)}
                          className="m-0 cursor-pointer select-none"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!workspaceSlug || !projectId || !issueId) return;
                            setPeekIssue({
                              workspaceSlug: String(workspaceSlug),
                              projectId,
                              issueId,
                              isArchived,
                            });
                          }}
                        >
                          {text}
                        </Tag>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      if (field === "precondition" || field === "remark") {
        return (
          <div className="text-gray-800">
            <RichTextEditor value={String(value || "")} onChange={() => {}} editable={false} placeholder="-" />
          </div>
        );
      }

      if (field === "steps") {
        const rows = Array.isArray(value) ? value : [];
        if (rows.length === 0) return <span className="text-gray-400">-</span>;
        return (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-300 border-collapse table-fixed">
              <colgroup>
                <col style={{ width: 64 }} />
                <col />
                <col style={{ width: "35%" }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium text-gray-700">
                    编号
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium text-gray-700">
                    步骤描述
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium text-gray-700">
                    预期结果
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={i} className="align-top">
                    <td className="border border-gray-300 px-2 py-2 text-center text-xs text-gray-700">{i + 1}</td>
                    <td className="border border-gray-300 px-2 py-2">
                      <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-gray-800">
                        {String(r?.description ?? "").trim() || "-"}
                      </pre>
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-gray-800">
                        {String(r?.result ?? "").trim() || "-"}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      if (Array.isArray(value) || typeof value === "object") {
        return <pre className="whitespace-pre-wrap text-xs leading-5">{JSON.stringify(value, null, 2)}</pre>;
      }

      return <span className="text-sm">{String(value)}</span>;
    },
    [enumLabel, setPeekIssue, workspaceSlug]
  );

  const baseLabel = compareBaseVersion === undefined ? "历史" : `历史 v${Number(compareBaseVersion)}`;

  const changedFields: any[] = Array.isArray(compareData?.changed_fields) ? compareData.changed_fields : [];
  const contentHeight = typeof height === "number" ? `${height}px` : height;

  const handleOpenFullscreen = React.useCallback(() => {
    const baseVersion = compareBaseVersion ?? historyVersionOptions[0]?.value;
    if (!workspaceSlug || !caseId || !projectId) return;
    if (latestVersion === undefined) return;
    if (baseVersion === undefined) return;

    const url =
      `/${encodeURIComponent(String(workspaceSlug))}` +
      `/projects/${encodeURIComponent(String(projectId))}` +
      `/testhub/cases/compare?caseId=${encodeURIComponent(String(caseId))}` +
      `&baseVersion=${encodeURIComponent(String(baseVersion))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [compareBaseVersion, historyVersionOptions, workspaceSlug, caseId, projectId, latestVersion]);

  const canOpenFullscreen =
    !!workspaceSlug &&
    !!caseId &&
    !!projectId &&
    latestVersion !== undefined &&
    (compareBaseVersion !== undefined || historyVersionOptions.length > 0);

  return (
    <Modal
      title={
        <div className="flex items-center justify-between gap-3">
          <span>版本对比</span>
          <div className="flex items-center gap-2 -mr-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleOpenFullscreen}
              disabled={!canOpenFullscreen}
              aria-label="全屏打开版本对比"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              onClick={onClose}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={width}
      destroyOnClose
      closable={false}
      zIndex={1250}
    >
      <div className="flex flex-col" style={{ height: contentHeight, maxHeight: contentHeight }}>
        {historyVersionOptions.length === 0 ? (
          <div className="text-sm text-gray-600">暂无历史版本可对比</div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-gray-700 shrink-0 w-20">历史版本</span>
              <Select
                className="flex-1"
                value={compareBaseVersion}
                options={historyVersionOptions}
                onChange={(v) => setCompareBaseVersion(Number(v))}
                dropdownStyle={{ zIndex: 1300 }}
              />
              <span className="text-sm text-gray-700 shrink-0">当前版本</span>
              <span className="text-sm text-gray-900">{currentVersionLabel}</span>
            </div>

            <div className="flex-1 min-h-0 vertical-scrollbar scrollbar-md overflow-y-scroll pr-1">
              {loadingCompare ? (
                <div className="py-10 flex items-center justify-center">
                  <Spin />
                </div>
              ) : changedFields.length === 0 ? (
                <div className="text-sm text-gray-600">没有差异</div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">共 {changedFields.length} 处差异</div>
                  {changedFields.map((item, idx) => (
                    <div key={`${item?.field || "field"}_${idx}`} className="rounded border bg-white p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-sm font-medium text-gray-900">{item?.label || item?.field}</div>
                        {item?.added || item?.removed ? (
                          <div className="text-xs text-gray-500">
                            {Array.isArray(item?.added) && item.added.length > 0 ? (
                              <span className="mr-3">新增 {item.added.length}</span>
                            ) : null}
                            {Array.isArray(item?.removed) && item.removed.length > 0 ? (
                              <span>移除 {item.removed.length}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded bg-red-50 p-3">
                          <div className="text-xs text-gray-600 mb-1">{baseLabel}</div>
                          {renderValue(item, "from")}
                        </div>
                        <div className="rounded bg-green-50 p-3">
                          <div className="text-xs text-gray-600 mb-1">{currentVersionLabel}</div>
                          {renderValue(item, "to")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
