"use client";

import React from "react";
import { Transition } from "@headlessui/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { Row, Col, Card, Input, Tag, Spin, message, Button, Table, Tooltip, Radio, Select, Tree, Modal, Checkbox, Upload, Dropdown } from "antd";
import type { TreeProps } from "antd";
import { AppstoreOutlined, DownOutlined } from "@ant-design/icons";
import * as LucideIcons from "lucide-react";
import debounce from "lodash-es/debounce";
import { CaseService as CaseApiService } from "@/services/qa/case.service";
import { PlanService as PlanApiService } from "@/services/qa/plan.service";
import { getEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import { RichTextEditor, STEPS_TABLE_TH_STYLE, STEPS_TABLE_TD_STYLE } from "../cases/util";
import { TitleInput } from "../cases/update-modal/title-input";
import { CaseMetaForm } from "../cases/update-modal/case-meta-form";
import { RequirementDisplayPanel } from "../cases/requirement-display-panel";
import { CaseReviewRecordsTable } from "../cases/case-review-records-table";
import { ChevronDownIcon } from "@plane/propel/icons";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { WorkItemDisplayModal } from "../cases/work-item-display-modal";
import { workItemTypeName } from "../cases/work-item-category";
import { ReviewRecordsPanel } from "../review/review-records";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { ExecutionRecordsPanel } from "./execution-records";
import { usePendingExecutionFiles } from "./use-pending-execution-files";
import { BugIssueModal } from "@/components/issues/issue-modal/bug-modal";
import { ExecutionCaseFilterBar, useExecutionCaseFilter } from "./execution-case-filter";
import {
  DEFAULT_PLAN_CASE_GROUP_BY,
  isPlanCaseGroupBy,
  type TPlanCaseGroupBy,
} from "@/components/qa/plans/plan-case-display-filters";
import { PlanCaseAssigneeTree } from "@/components/qa/plans/plan-case-assignee-tree";
import { PlanCaseGroupTree } from "@/components/qa/plans/plan-case-group-tree";
import { usePlanAssigneeTree } from "@/components/qa/plans/use-plan-assignee-tree";
import { usePlanGroupTree } from "@/components/qa/plans/use-plan-group-tree";

type ReviewCaseRow = {
  id: string | number;
  case_id: string | number;
  name: string;
  priority: number;
  assignee: string | null;
  result: string;
  created_by: string | number | null;
};
type PlanCaseRow = {
  id: string | number;
  case: string | number;
  name: string;
  priority: number;
  assignees: string[];
  result: string;
  created_by: string | number | null;
};

// 多执行人：当前用户在执行人列表中即可提交执行结果
const isPlanCaseAssignee = (row: PlanCaseRow | undefined, userId?: string | number | null) =>
  Boolean(userId) && (row?.assignees ?? []).map(String).includes(String(userId));

const StepTypeSwitcher: React.FC<{ mode: number; onChange: (mode: number) => void }> = ({ mode, onChange }) => (
  <Dropdown
    trigger={["click"]}
    overlayStyle={{ zIndex: 1200 }}
    menu={{
      selectable: true,
      selectedKeys: [mode === 1 ? "text" : "step"],
      items: [
        { key: "step", label: "步骤描述" },
        { key: "text", label: "文本描述" },
      ],
      onClick: ({ key }) => onChange(key === "text" ? 1 : 0),
    }}
  >
    <Button type="text" size="small" className="px-0 text-sm font-medium text-tertiary hover:text-secondary">
      更改类型 <DownOutlined />
    </Button>
  </Dropdown>
);

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function TestExecutionPage() {
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug?: string; projectId?: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCaseId = searchParams.get("case_id") ?? undefined;
  const planId = searchParams.get("plan_id") ?? searchParams.get("planId") ?? "";
  const reviewId = searchParams.get("review_id") ?? "";
  const repositoryId = searchParams.get("repositoryId") ?? "";
  // 列表页「显示 → 分组方式」经 URL 带过来；直接进 URL 或值非法时回落到默认的模块树
  const groupByParam = searchParams.get("group_by");
  const groupBy: TPlanCaseGroupBy = isPlanCaseGroupBy(groupByParam) ? groupByParam : DEFAULT_PLAN_CASE_GROUP_BY;

  const [planName, setPlanName] = React.useState<string>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("selectedPlanName") || "";
    return "";
  });

  const caseService = React.useMemo(() => new CaseApiService(), []);
  const planService = React.useMemo(() => new PlanApiService(), []);
  const {
    getUserDetails,
    workspace: { fetchWorkspaceMembers },
  } = useMember();
  const { data: currentUser } = useUser();

  const [listLoading, setListLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cases, setCases] = React.useState<PlanCaseRow[]>([]);
  const [keyword, setKeyword] = React.useState<string>("");
  const [selectedCaseId, setSelectedCaseId] = React.useState<string | undefined>(initialCaseId ?? undefined);

  const [expandedKeys, setExpandedKeys] = React.useState<string[] | undefined>(undefined);
  const [autoExpandParent, setAutoExpandParent] = React.useState<boolean>(true);
  const [selectedTreeKey, setSelectedTreeKey] = React.useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = React.useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = React.useState<string | null>(null);
  const [planTree, setPlanTree] = React.useState<any | null>(null);
  // 执行人 / 类型 / 优先级 / 执行结果 分组下左树的选中值（执行人为用户 id 或 "unassigned"），null 表示「全部」
  const [selectedGroupValue, setSelectedGroupValue] = React.useState<string | null>(null);
  const { tree: assigneeTree, loading: assigneeTreeLoading } = usePlanAssigneeTree({
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
    planId: planId || null,
    enabled: groupBy === "assignee",
  });
  const {
    tree: groupTree,
    loading: groupTreeLoading,
    refresh: refreshGroupTree,
  } = usePlanGroupTree({
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
    planId: planId || null,
    groupBy,
  });

  const [detailLoading, setDetailLoading] = React.useState<boolean>(false);
  const [caseDetail, setCaseDetail] = React.useState<any>(null);
  const [enumsData, setEnumsData] = React.useState<{
    case_type?: Record<string, string>;
    case_priority?: Record<string, string>;
    case_state?: Record<string, string>;
    plan_case_result?: Record<string, string>;
  }>({});
  const {
    activeKey: executionFilterKey,
    setActiveKey: setExecutionFilterKey,
    items: executionFilterItems,
    filteredCases,
    isFiltering: isExecutionFiltering,
  } = useExecutionCaseFilter(cases, enumsData.plan_case_result, currentUser?.id);
  // 详情页同款属性行的数据准备：将 id/枚举值规范化为字符串，保证与下拉 options 的 value 类型一致
  const normalizeId = (v: any): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "object") {
      const id = v.id ?? v.value ?? v.uuid;
      return id ? String(id) : undefined;
    }
    return String(v);
  };
  const caseTypeOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_type || {}).map(([value, label]) => ({
        value,
        label,
        title: String(label),
      })),
    [enumsData.case_type]
  );
  const casePriorityOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_priority || {}).map(([value, label]) => ({
        value,
        label,
        title: String(label),
      })),
    [enumsData.case_priority]
  );
  const [attachments, setAttachments] = React.useState<any[]>([]);
  const [activeTab, setActiveTab] = React.useState<
    "basic" | "req-link" | "work" | "defect" | "history" | "review" | "attachment"
  >("basic");
  const [currentCount, setCurrentCount] = React.useState<number>(0);
  const [reviewValue, setReviewValue] = React.useState<string | null>(null);
  const [autoNext, setAutoNext] = React.useState<boolean>(true);
  const [reason, setReason] = React.useState<string>("");
  const [reasonModalOpen, setReasonModalOpen] = React.useState<boolean>(false);
  const [reasonDraft, setReasonDraft] = React.useState<string>("");
  const [submitLoading, setSubmitLoading] = React.useState<boolean>(false);
  const [recordsRefreshKey, setRecordsRefreshKey] = React.useState<number>(0);
  const [isCurrentUserReviewer, setIsCurrentUserReviewer] = React.useState<boolean>(false);
  const [stepActualResultMap, setStepActualResultMap] = React.useState<Record<number, string>>({});
  const [stepExecResultMap, setStepExecResultMap] = React.useState<Record<number, string>>({});
  const [stepViewMode, setStepViewMode] = React.useState<number>(0);
  const [isCreateDefectOpen, setIsCreateDefectOpen] = React.useState<boolean>(false);
  const { pendingFiles, add: addPendingFile, remove: removePendingFile, clear: clearPendingFiles, uploadAll: uploadPendingFiles } =
    usePendingExecutionFiles();

  const [mounted, setMounted] = React.useState(false);
  const leftRef = React.useRef<HTMLDivElement | null>(null);
  const rightRef = React.useRef<HTMLDivElement | null>(null);
  const syncingRef = React.useRef<boolean>(false);

  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const topOffset = projectPreferences.navigationMode === "horizontal" ? 180 : 130;

  // Resize logic
  const [leftWidth, setLeftWidth] = React.useState<number>(280);
  const isDraggingRef = React.useRef<boolean>(false);
  const startXRef = React.useRef<number>(0);
  const startWidthRef = React.useRef<number>(0);

  const onMouseMoveResize = React.useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    const next = Math.min(600, Math.max(200, startWidthRef.current + delta));
    setLeftWidth(next);
  }, []);

  const onMouseUpResize = React.useCallback(() => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", onMouseMoveResize);
    document.removeEventListener("mouseup", onMouseUpResize);
    document.body.style.cursor = "auto";
    document.body.style.userSelect = "auto";
  }, [onMouseMoveResize]);

  const onMouseDownResize = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
    document.addEventListener("mousemove", onMouseMoveResize);
    document.addEventListener("mouseup", onMouseUpResize);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  // 分组树选中值 → 中间列表的精确过滤参数；模块分组或未选中时为空
  const buildGroupFilterParams = (groupValue: string | null) => {
    if (!groupValue) return {};
    if (groupBy === "assignee") {
      return groupValue === "unassigned" ? { assignee_isnull: true } : { assignee_id: groupValue };
    }
    if (groupBy === "type") return { case__type: groupValue };
    if (groupBy === "priority") return { case__priority: groupValue };
    if (groupBy === "result") return { result: groupValue };
    return {};
  };

  const fetchCases = async (
    kw?: string,
    repoId: string | null = selectedRepositoryId,
    moduleId: string | null = selectedModuleId,
    autoSelectFirst?: boolean,
    silent = false,
    groupValue: string | null = selectedGroupValue
  ) => {
    if (!workspaceSlug) return;
    try {
      if (!silent) {
        setListLoading(true);
      }
      setError(null);
      const input = (kw ?? keyword).trim();
      const res = await planService.getPlanCaseList(String(workspaceSlug), String(planId), {
        all: true,
        ...(repoId ? { repository_id: repoId } : {}),
        ...(moduleId ? { module_id: moduleId } : {}),
        ...buildGroupFilterParams(groupValue),
        ...(input ? { name__icontains: input } : {}),
      });
      const nextCases = Array.isArray(res?.data) ? (res.data as PlanCaseRow[]) : [];
      setCases(nextCases);
      if (autoSelectFirst) {
        const first = nextCases?.[0];
        const firstCaseId = first?.case ? String(first.case) : undefined;
        setSelectedCaseId(firstCaseId);
        if (firstCaseId) {
          fetchCaseDetail(firstCaseId);
        } else {
          setCaseDetail(null);
        }
      }
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "获取用例列表失败";
      setError(msg);
      message.error(msg);
    } finally {
      if (!silent) {
        setListLoading(false);
      }
    }
  };

  const fetchEnums = async () => {
    if (!workspaceSlug) return;
    try {
      const enums = await getEnums(String(workspaceSlug));
      setEnumsData({
        case_type: enums.case_type || {},
        case_priority: enums.case_priority || {},
        case_state: enums.case_state || {},
        plan_case_result: enums.plan_case_result || {},
      });
    } catch {}
  };

  const fetchPlanTree = async () => {
    if (!workspaceSlug || !planId) return;
    try {
      const data = await caseService.getPlanCaseTree(String(workspaceSlug), { plan_id: String(planId) });
      setPlanTree(data || null);
      setExpandedKeys(data ? collectDefaultExpandedKeys(data) : undefined);
      setAutoExpandParent(true);
    } catch {
      setPlanTree(null);
      setExpandedKeys(undefined);
      setAutoExpandParent(true);
    }
  };

  const fetchCaseDetail = async (id?: string) => {
    const targetId = id ?? selectedCaseId;
    if (!workspaceSlug || !targetId) return;
    try {
      setDetailLoading(true);
      let data: any = null;
      try {
        if (planId) {
          data = await planService.getPlanCaseDetail(String(workspaceSlug), {
            plan_id: String(planId),
            case_id: String(targetId),
          });
        } else {
          data = await caseService.getCase(String(workspaceSlug), String(targetId));
        }
      } catch (err) {
        data = await caseService.getCase(String(workspaceSlug), String(targetId));
      }
      setCaseDetail(data);
      setStepViewMode(Number((data as any)?.mode) === 1 ? 1 : 0);
      try {
        const list = await caseService.getCaseAssetList(String(workspaceSlug), String(targetId));
        setAttachments(Array.isArray(list) ? list : []);
      } catch {
        setAttachments([]);
      }
      try {
        const stepsData =
          Array.isArray((data as any)?.execute_steps) && (data as any).execute_steps.length > 0
            ? ((data as any).execute_steps as any[])
            : Array.isArray((data as any)?.steps)
              ? ((data as any).steps as any[])
              : [];
        const initialActualMap: Record<number, string> = {};
        const initialExecMap: Record<number, string> = {};
        stepsData.forEach((s: any, idx: number) => {
          if (s && s.actual_result !== undefined && s.actual_result !== null) {
            initialActualMap[idx] = String(s.actual_result);
          }
          if (s && s.exec_result !== undefined && s.exec_result !== null) {
            initialExecMap[idx] = String(s.exec_result);
          }
        });
        setStepActualResultMap(initialActualMap);
        setStepExecResultMap(initialExecMap);
      } catch {}
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "获取用例详情失败";
      message.error(msg);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDownloadAttachment = async (attachment: any) => {
    const aid = String(attachment?.id ?? "");
    if (!workspaceSlug || !selectedCaseId || !aid) return;
    try {
      const resp = await caseService.getCaseAsset(String(workspaceSlug), String(selectedCaseId), aid);
      const blob = resp?.data as Blob;
      const filename = String(attachment?.attributes?.name ?? "附件");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!planId || !workspaceSlug || !projectId || planName) return;
    planService
      .getPlanList(String(workspaceSlug), { project_id: String(projectId) })
      .then((list) => {
        const found = list.find((p) => String(p.id) === String(planId));
        if (found?.name) setPlanName(found.name);
      })
      .catch(() => {});
  }, [planId, workspaceSlug, projectId]);

  React.useEffect(() => {
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    setSelectedGroupValue(null);
    fetchCases(undefined, null, null, undefined, false, null);
    fetchPlanTree();
    fetchEnums();
    if (workspaceSlug) {
      try {
        fetchWorkspaceMembers(String(workspaceSlug));
      } catch (e: any) {
        const msg = e?.message || e?.detail || e?.error || "获取成员信息失败";
        message.error(msg);
      }
    }
  }, [workspaceSlug, planId, initialCaseId, groupBy]);

  React.useEffect(() => {
    if (initialCaseId) fetchCaseDetail(initialCaseId);
  }, [initialCaseId]);

  React.useEffect(() => {
    if (!selectedCaseId) return;
    const container = leftRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-case-id="${selectedCaseId}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [selectedCaseId, filteredCases]);

  const debouncedSearch = React.useMemo(
    () =>
      debounce((v: string) => {
        fetchCases(v);
      }, 300),
    [workspaceSlug, planId, selectedRepositoryId, selectedModuleId]
  );

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const key = Array.isArray(selectedKeys) && selectedKeys.length > 0 ? String(selectedKeys[0]) : "root";
    setSelectedTreeKey(key);

    const node: any = (info as any)?.node || {};
    const kind = node?.kind as string | undefined;

    if (!kind || kind === "root") {
      setSelectedRepositoryId(null);
      setSelectedModuleId(null);
      setSelectedCaseId(undefined);
      setCaseDetail(null);
      fetchCases(keyword, null, null, true);
      return;
    }

    if (kind === "repository" || kind === "repository_modules_all") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(null);
      setSelectedCaseId(undefined);
      setCaseDetail(null);
      fetchCases(keyword, repoId, null, true);
      return;
    }

    if (kind === "module") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      const moduleId = node?.moduleId ? String(node.moduleId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(moduleId);
      setSelectedCaseId(undefined);
      setCaseDetail(null);
      fetchCases(keyword, repoId, moduleId, true);
    }
  };

  // 执行人树 / 枚举分组树共用：key 形如 root、assignee:<id>、unassigned、<kind>:<枚举值>
  const handleGroupTreeSelect = (key: string) => {
    setSelectedTreeKey(key);
    // "unassigned" 不含冒号，indexOf 为 -1，slice(0) 仍是自身
    const nextGroupValue = key === "root" ? null : key.slice(key.indexOf(":") + 1);
    setSelectedGroupValue(nextGroupValue);
    setSelectedCaseId(undefined);
    setCaseDetail(null);
    fetchCases(keyword, null, null, true, false, nextGroupValue);
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const renderNodeTitle = (title: string, icon: React.ReactNode, count?: number, fontMedium?: boolean) => (
    <div className="group flex items-center justify-between gap-2 w-full">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-5 h-5 text-secondary">{icon}</span>
        <span className={`text-sm text-primary ${fontMedium ? "font-medium" : ""}`}>{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {typeof count === "number" && <span className="text-xs text-secondary">{count}</span>}
      </div>
    </div>
  );

  function getTreeNodeKey(node: any): string {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;

    if (kind === "root") return "root";
    if (kind === "repository") return `repo:${id}`;
    if (kind === "repository_modules_all") return `repo:${repositoryId}:all_modules`;
    if (kind === "module") return `module:${id}`;
    return id;
  }

  function collectDefaultExpandedKeys(node: any): string[] {
    const keys = new Set<string>();
    const visit = (n: any) => {
      const kind = String(n?.kind || "");
      if (kind === "root" || kind === "repository" || kind === "repository_modules_all") {
        keys.add(getTreeNodeKey(n));
      }
      const children = Array.isArray(n?.children) ? n.children : [];
      children.forEach(visit);
    };
    visit(node);
    return Array.from(keys);
  }

  const buildTreeNodes = (node: any): any => {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;

    const key = getTreeNodeKey(node);

    const icon =
      kind === "root" ? (
        <AppstoreOutlined />
      ) : kind === "repository" ? (
        <LucideIcons.Atom size={14} />
      ) : kind === "repository_modules_all" ? (
        <AppstoreOutlined />
      ) : (
        <LucideIcons.FolderOpenDot size={14} />
      );

    const children = Array.isArray(node?.children) ? node.children : [];

    return {
      title: renderNodeTitle(node?.name ?? "-", icon, undefined, kind === "root" || kind === "repository_modules_all"),
      key,
      kind,
      repositoryId,
      moduleId: kind === "module" ? id : null,
      children: children.map((c: any) => buildTreeNodes(c)),
    };
  };

  const treeData = React.useMemo(() => {
    if (!planTree) return [];
    return [buildTreeNodes(planTree)];
  }, [planTree]);

  const handleChangeActual = React.useCallback(
    (idx: number, val: string) => setStepActualResultMap((prev) => ({ ...prev, [idx]: val })),
    []
  );
  const handleChangeExec = React.useCallback(
    (idx: number, val: string) => setStepExecResultMap((prev) => ({ ...prev, [idx]: val })),
    []
  );

  React.useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  React.useEffect(() => {
    const map: Record<string, string> = {
      work: workItemTypeName("Task"),
      defect: workItemTypeName("Bug"),
    };
    const type_name = map[activeTab];
    if (!type_name || !workspaceSlug || !selectedCaseId) {
      setCurrentCount(0);
      return;
    }
    caseService
      .issueList(String(workspaceSlug), { case_id: String(selectedCaseId), type_name })
      .then((res) => {
        const list = Array.isArray((res as any)?.data)
          ? ((res as any).data as any[])
          : Array.isArray(res)
            ? (res as any[])
            : [];
        const count = (res as any)?.count ?? list.length;
        setCurrentCount(count);
      })
      .catch(() => setCurrentCount(0));
  }, [activeTab, workspaceSlug, selectedCaseId]);

  const handleRadioChange = (e: any) => {
    const val = String(e?.target?.value || "");
    setReviewValue(val);
  };

  React.useEffect(() => {
    const row = cases.find((item) => String(item.case) === String(selectedCaseId || ""));
    setIsCurrentUserReviewer(isPlanCaseAssignee(row, currentUser?.id));
  }, [cases, selectedCaseId, currentUser?.id]);

  React.useEffect(() => {
    setActiveTab("basic");
  }, [selectedCaseId]);

  React.useEffect(() => {
    if (!selectedCaseId) return;
    const row = cases.find((item) => String(item.case) === String(selectedCaseId || ""));
    const isReviewer = isPlanCaseAssignee(row, currentUser?.id);
    const map = enumsData?.plan_case_result || {};
    const keys = Object.keys(map).filter((k) => k !== "未执行");
    let def: string | null = null;
    if (isReviewer && keys.includes("通过")) def = "通过";
    else def = keys[0] ?? null;
    setReviewValue(def);
    setReason("");
    clearPendingFiles();
  }, [selectedCaseId, cases, currentUser?.id, enumsData?.plan_case_result]);

  const casesRef = React.useRef(filteredCases);
  const selectedCaseIdRef = React.useRef(selectedCaseId);
  const autoNextRef = React.useRef(autoNext);
  const pendingFilesRef = React.useRef(pendingFiles);
  React.useEffect(() => {
    casesRef.current = filteredCases;
    selectedCaseIdRef.current = selectedCaseId;
    autoNextRef.current = autoNext;
    pendingFilesRef.current = pendingFiles;
  });

  const goToNextCase = async () => {
    const list = casesRef.current;
    const curId = String(selectedCaseIdRef.current || "");
    const idx = list.findIndex((item) => String(item.case) === curId);
    if (idx >= 0 && idx < list.length - 1) {
      const next = list[idx + 1];
      const nextCaseId = String(next.case);
      setSelectedCaseId(nextCaseId);
      await fetchCaseDetail(nextCaseId);
      return;
    }
    message.warning("已是最后一条用例");
  };
  const goToNextCaseRef = React.useRef(goToNextCase);
  goToNextCaseRef.current = goToNextCase;

  const getErrorMessage = (e: any, fallback: string) => {
    if (!e) return fallback;
    if (typeof e === "string") return e;
    const direct =
      e?.msg ??
      e?.message ??
      e?.detail ??
      e?.error ??
      e?.data?.msg ??
      e?.data?.message ??
      e?.data?.detail ??
      e?.data?.error;
    if (direct) return String(direct);
    if (typeof e === "object") {
      const keys = Object.keys(e);
      if (keys.length > 0) {
        const v = (e as any)[keys[0]];
        if (typeof v === "string") return v;
        if (Array.isArray(v) && v.length > 0) return String(v[0]);
      }
    }
    return fallback;
  };

  const buildPayload = () => {
    if (!workspaceSlug || !planId || !selectedCaseId || !reviewValue || !currentUser?.id) return null;
    const chosenSteps =
      Array.isArray((caseDetail as any)?.execute_steps) && (caseDetail as any).execute_steps.length > 0
        ? ((caseDetail as any).execute_steps as any[])
        : Array.isArray((caseDetail as any)?.steps)
          ? ((caseDetail as any).steps as any[])
          : [];
    const stepsPayload = (chosenSteps || []).map((s: any, idx: number) => ({
      description: String(s?.description ?? ""),
      result: String(s?.result ?? ""),
      actual_result: String(stepActualResultMap[idx] || ""),
      exec_result: String(stepExecResultMap[idx] || ""),
    }));
    const payload: any = {
      plan_id: String(planId),
      case_id: String(selectedCaseId),
      result: String(reviewValue),
      steps: stepsPayload,
      assignee: String(currentUser.id),
      issue_ids: [],
    };
    if (reason && reason.trim()) payload.reason = reason.trim();
    return payload;
  };

  const debouncedSubmit = React.useMemo(
    () =>
      debounce(async (payload: any) => {
        if (!payload) return;
        setSubmitLoading(true);
        try {
          const res = await planService.caseExecute(String(workspaceSlug), payload);
          message.success("执行结果提交成功");

          // 提交成功后，将暂存的附件真正上传并绑定到本次执行记录
          const filesToUpload = pendingFilesRef.current;
          if (filesToUpload.length > 0) {
            const records: Array<{ case_id: string; record_id: string }> = Array.isArray((res as any)?.records)
              ? (res as any).records
              : [];
            const currentCaseId = String(selectedCaseIdRef.current || "");
            const recordId =
              records.find((r) => String(r.case_id) === currentCaseId)?.record_id ?? records[0]?.record_id;
            if (recordId) {
              const { failedCount } = await uploadPendingFiles(String(workspaceSlug), String(recordId), filesToUpload);
              if (failedCount > 0) {
                message.warning(`有 ${failedCount} 个附件上传失败`);
              }
              clearPendingFiles();
            } else {
              message.warning("未获取到执行记录，附件未上传");
            }
          }

          setReason("");
          setStepActualResultMap({});
          setStepExecResultMap({});
          await fetchCases(keyword, selectedRepositoryId, selectedModuleId, false, true);
          // 执行结果变了，「执行结果」分组树的计数要同步（非枚举分组时 no-op）
          void refreshGroupTree();
          if (autoNextRef.current) {
            await goToNextCaseRef.current();
          } else {
            const activeCaseId = String(selectedCaseIdRef.current || "");
            if (activeCaseId) {
              await fetchCaseDetail(activeCaseId);
            }
          }
        } catch (e: any) {
          const msg = getErrorMessage(e, "请稍后重试");
          message.error(msg.startsWith("执行失败") ? msg : `执行失败：${msg}`);
        } finally {
          setSubmitLoading(false);
        }
      }, 500),
    [
      workspaceSlug,
      keyword,
      selectedCaseId,
      selectedRepositoryId,
      selectedModuleId,
      selectedGroupValue,
      refreshGroupTree,
      uploadPendingFiles,
      clearPendingFiles,
    ]
  );

  React.useEffect(() => {
    return () => {
      debouncedSubmit.cancel();
    };
  }, [debouncedSubmit]);

  const handleSubmitReview = () => {
    if (!isCurrentUserReviewer) {
      message.warning("当前用例仅执行人可提交执行结果");
      return;
    }
    const payload = buildPayload();
    if (!payload) {
      message.warning("缺少必要参数或用户信息，无法提交");
      return;
    }
    debouncedSubmit(payload);
  };

  const handleOpenCreateDefect = () => {
    if (!workspaceSlug) {
      message.warning("缺少工作空间信息，无法创建缺陷");
      return;
    }
    setIsCreateDefectOpen(true);
  };

  const onSyncScroll = (source: "left" | "right") => {
    if (syncingRef.current) return;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    syncingRef.current = true;
    const s = source === "left" ? left : right;
    const t = source === "left" ? right : left;
    const sMax = Math.max(1, s.scrollHeight - s.clientHeight);
    const tMax = Math.max(1, t.scrollHeight - t.clientHeight);
    const ratio = s.scrollTop / sMax;
    const targetTop = ratio >= 0.999 ? tMax : ratio * tMax;
    if (Math.abs(t.scrollTop - targetTop) > 1) {
      t.scrollTop = targetTop;
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    } else {
      setTimeout(() => {
        syncingRef.current = false;
      }, 0);
    }
  };

  type StepItem = { result: string; description: string; exec_result?: string; actual_result?: string; __key: string };
  const displaySteps = React.useMemo((): StepItem[] => {
    const execSteps = Array.isArray((caseDetail as any)?.execute_steps)
      ? ((caseDetail as any).execute_steps as any[])
      : null;
    const baseSteps = Array.isArray((caseDetail as any)?.steps) ? ((caseDetail as any).steps as any[]) : [];
    const chosen = execSteps && execSteps.length > 0 ? execSteps : baseSteps;
    return (chosen || []).map((s: any, i: number) => ({
      description: String(s?.description ?? ""),
      result: String(s?.result ?? ""),
      exec_result: String(s?.exec_result ?? ""),
      actual_result: String(s?.actual_result ?? ""),
      __key: `${String(s?.id ?? "")}-${String(s?.description ?? "")}-${i}`,
    }));
  }, [caseDetail]);
  const buildStepsHtml = React.useCallback((): string => {
    const steps = displaySteps;
    if (!steps || steps.length === 0) return "<p></p>";
    const escape = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const header =
      '<tr style="">' +
      '<td colspan="1" rowspan="1" colwidth="80" hidecontent="false" class="" style=""><p class="editor-paragraph-block">序号</p></td>' +
      '<td colspan="1" rowspan="1" colwidth="260" hidecontent="false" class="" style=""><p class="editor-paragraph-block">步骤描述</p></td>' +
      '<td colspan="1" rowspan="1" colwidth="160" hidecontent="false" class="" style=""><p class="editor-paragraph-block">预期结果</p></td>' +
      '<td colspan="1" rowspan="1" colwidth="260" hidecontent="false" class="" style=""><p class="editor-paragraph-block">实际结果</p></td>' +
      '<td colspan="1" rowspan="1" colwidth="140" hidecontent="false" class="" style=""><p class="editor-paragraph-block">步骤执行结果</p></td>' +
      "</tr>";
    const rows = steps
      .map((s, i) => {
        const idx = String(i + 1);
        const desc = escape(String(s.description || ""));
        const expected = escape(String((s as any).expected_result || s.result || ""));
        const actual = escape(String((s as any).actual_result || ""));
        const exec = escape(String((s as any).exec_result || ""));
        return (
          '<tr style="">' +
          '<td colspan="1" rowspan="1" colwidth="80" hidecontent="false" class="" style=""><p class="editor-paragraph-block">' +
          idx +
          "</p></td>" +
          '<td colspan="1" rowspan="1" colwidth="260" hidecontent="false" class="" style=""><p class="editor-paragraph-block">' +
          desc +
          "</p></td>" +
          '<td colspan="1" rowspan="1" colwidth="160" hidecontent="false" class="" style=""><p class="editor-paragraph-block">' +
          expected +
          "</p></td>" +
          '<td colspan="1" rowspan="1" colwidth="260" hidecontent="false" class="" style=""><p class="editor-paragraph-block">' +
          actual +
          "</p></td>" +
          '<td colspan="1" rowspan="1" colwidth="140" hidecontent="false" class="" style=""><p class="editor-paragraph-block">' +
          exec +
          "</p></td>" +
          "</tr>"
        );
      })
      .join("");
    return "<table><thead>" + header + "</thead><tbody>" + "<p></p>" + rows + "</tbody></table><p></p><p></p>";
  }, [displaySteps]);

  const StepsTableBase: React.FC<{
    steps?: StepItem[];
    actualMap: Record<number, string>;
    execMap: Record<number, string>;
    onChangeActual: (idx: number, val: string) => void;
    onChangeExec: (idx: number, val: string) => void;
  }> = ({ steps, actualMap, execMap, onChangeActual, onChangeExec }) => {
    if (!Array.isArray(steps) || steps.length === 0) {
      return <span className="text-secondary">暂无内容</span>;
    }
    const headerStyle = STEPS_TABLE_TH_STYLE;
    const cellStyle = STEPS_TABLE_TD_STYLE;
    const resultOptions = React.useMemo(() => {
      const map = enumsData?.plan_case_result || {};
      const options = Object.keys(map).map((key) => ({
        label: (
          <Tag color={map[key]} className="w-full m-0 text-center block py-1">
            {key}
          </Tag>
        ),
        value: key,
      }));
      const existingValues = Object.values(execMap || {}).filter(Boolean) as string[];
      existingValues.forEach((v) => {
        if (!options.find((o) => String(o.value) === String(v))) {
          options.push({
            label: (
              <Tag className="w-full m-0 text-center block py-1">
                {v}
              </Tag>
            ),
            value: v,
          } as any);
        }
      });
      return options;
    }, [enumsData, execMap]);

    const EditableTextArea: React.FC<{ value: string; onCommit: (v: string) => void; placeholder?: string }> = ({
      value,
      onCommit,
      placeholder,
    }) => {
      const [v, setV] = React.useState<string>(value || "");
      React.useEffect(() => {
        setV(value || "");
      }, [value]);
      return (
        <Input.TextArea
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => onCommit(v)}
          variant="borderless"
          autoSize={{ minRows: 1 }}
          style={{ maxHeight: 300, overflow: "auto" }}
          placeholder={placeholder || "点击输入结果"}
          className="resize-none !p-2.5 text-sm !bg-transparent focus:!shadow-none"
        />
      );
    };
    const dataSource = React.useMemo(
      () => (steps || []).map((s, idx) => ({ ...s, actualValue: actualMap[idx] || "", execValue: execMap[idx] || "" })),
      [steps, actualMap, execMap]
    );
    const columns = React.useMemo(
      () => [
        {
          title: "序号",
          key: "index",
          width: 60,
          render: (_: any, __: any, idx: number) => <span>{idx + 1}</span>,
          onHeaderCell: () => ({ style: headerStyle }),
          onCell: () => ({ style: cellStyle }),
        },
        {
          title: "步骤描述",
          dataIndex: "description",
          key: "description",
          width: "30%",
          render: (text: any) => (
            <span className="whitespace-pre-wrap break-words">{String(text || "")}</span>
          ),
          onHeaderCell: () => ({ style: headerStyle }),
          onCell: () => ({ style: cellStyle }),
        },
        {
          title: "预期结果",
          dataIndex: "result",
          key: "result",
          width: "30%",
          render: (text: any) => (
            <span className="whitespace-pre-wrap break-words">
              {String(text || "")}
            </span>
          ),
          onHeaderCell: () => ({ style: headerStyle }),
          onCell: () => ({ style: cellStyle }),
        },
        {
          title: "实际结果",
          key: "actual_result",
          width: "25%",
          shouldCellUpdate: (record: any, prevRecord: any) => record.actualValue !== prevRecord.actualValue,
          render: (_: any, record: any, idx: number) => (
            <div className="w-full h-full">
              <EditableTextArea value={record.actualValue} onCommit={(val) => onChangeActual(idx, val)} />
            </div>
          ),
          onHeaderCell: () => ({ style: headerStyle }),
          onCell: () => ({ style: { ...cellStyle, padding: 0 } }),
        },
        {
          title: "执行结果",
          width: "10%",
          key: "exec_result",
          shouldCellUpdate: (record: any, prevRecord: any) => record.execValue !== prevRecord.execValue,
          render: (_: any, record: any, idx: number) => (
            <Select
              placeholder="请选择"
              options={resultOptions}
              value={record.execValue || undefined}
              onChange={(v) => onChangeExec(idx, String(v))}
              variant="borderless"
              className="w-full [&_.ant-select-selector]:!p-0 [&_.ant-select-selection-item]:!flex [&_.ant-select-selection-item]:!justify-center"
              classNames={{ popup: { root: "min-w-[100px]" } }}
              suffixIcon={null}
            />
          ),
          onHeaderCell: () => ({ style: headerStyle }),
          onCell: () => ({ style: cellStyle }),
        },
      ],
      [resultOptions, onChangeActual, onChangeExec]
    );
    return (
      <div className="overflow-hidden rounded-lg" style={{ background: "#fff" }}>
        <Table
          size="small"
          pagination={false}
          bordered={false}
          tableLayout="fixed"
          className="text-sm [&_.ant-table]:text-sm [&_.ant-table-thead_.ant-table-cell::before]:!hidden [&_.ant-table-cell]:!border-b-0"
          rowKey={(r: any) => String(r?.__key)}
          dataSource={dataSource}
          columns={columns as any}
        />
      </div>
    );
  };
  const StepsTable = React.memo(StepsTableBase);

  return (
    <div className="flex flex-col gap-3 p-4 w-full">
      <PageHead title="用例详情" />
      <Breadcrumbs>
        <Breadcrumbs.Item
          component={
            <BreadcrumbLink
              href={
                workspaceSlug && projectId
                  ? `/${workspaceSlug}/projects/${projectId}/testhub/plans${
                      repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : ""
                    }`
                  : undefined
              }
              label="测试计划"
            />
          }
        />
        <Breadcrumbs.Item
          component={
            <BreadcrumbLink
              href={
                workspaceSlug && projectId && planId
                  ? `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${encodeURIComponent(planId)}${
                      repositoryId ? `&repositoryId=${encodeURIComponent(repositoryId)}` : ""
                    }`
                  : undefined
              }
              label={planName || "测试计划详情"}
            />
          }
        />
        <Breadcrumbs.Item component={<BreadcrumbLink label="用例详情" isLast />} />
      </Breadcrumbs>

      <Transition show={mounted} enter="transition-opacity duration-200" enterFrom="opacity-0" enterTo="opacity-100">
        <Row className="w-full rounded-md border border-subtle overflow-hidden" gutter={0} wrap={false}>
          <Col
            className="relative border-r border-subtle max-h-[calc(100dvh-130px)] flex flex-col group/left-col"
            flex="0 0 auto"
            style={{ width: leftWidth, minWidth: 200, maxWidth: 600, maxHeight: `calc(100dvh - ${topOffset}px)` }}
          >
            <style
              dangerouslySetInnerHTML={{
                __html: `
                .custom-tree-indent .ant-tree-indent-unit {
                  width: 10px !important;
                }
                .custom-tree-indent .ant-tree-switcher {
                  width: 20px !important;
                  margin-inline-end: 0px !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  margin-top: 2px !important;
                }
                .custom-tree-indent .ant-tree-node-content-wrapper {
                  padding-inline: 0px !important;
                  font-size: 0.875rem !important;
                  line-height: 1.25rem !important;
                  font-weight: 500 !important;
                }
              `,
              }}
            />
            <div className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm pt-2 pl-1">
              {groupBy === "module" ? (
                <Tree
                  showLine={false}
                  defaultExpandAll
                  switcherIcon={(nodeProps) => (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-secondary">
                      <ChevronDownIcon
                        className={`size-4 transition-transform rotate-0`}
                        strokeWidth={2.5}
                      />
                    </span>
                  )}
                  onSelect={onSelect}
                  onExpand={onExpand}
                  expandedKeys={expandedKeys}
                  autoExpandParent={autoExpandParent}
                  treeData={treeData}
                  selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
                  className="pb-2 pl-2 custom-tree-indent"
                />
              ) : groupBy === "assignee" ? (
                <PlanCaseAssigneeTree
                  tree={assigneeTree}
                  loading={assigneeTreeLoading}
                  selectedKey={selectedTreeKey}
                  onSelect={handleGroupTreeSelect}
                />
              ) : (
                <PlanCaseGroupTree
                  tree={groupTree}
                  loading={groupTreeLoading}
                  selectedKey={selectedTreeKey}
                  onSelect={handleGroupTreeSelect}
                  resultColors={enumsData.plan_case_result}
                />
              )}
            </div>
            {/* Resize Handle */}
            <div
              onMouseDown={onMouseDownResize}
              className="absolute top-0 right-[-3px] bottom-0 w-[6px] cursor-col-resize z-10"
            />
          </Col>

          <Col
            flex="0 0 auto"
            className="border-r border-subtle max-h-[calc(100dvh-130px)] overflow-hidden flex flex-col"
            style={{ width: 360, minWidth: 280, maxWidth: 520, maxHeight: `calc(100dvh - ${topOffset}px)` }}
          >
            <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex items-center gap-3">
                <Input.Search
                  className="flex-1 min-w-0"
                  placeholder="按用例名称搜索"
                  allowClear
                  onSearch={(v) => {
                    setKeyword(v);
                    debouncedSearch.cancel();
                    fetchCases(v);
                  }}
                  onChange={(e) => {
                    const v = e.target.value;
                    setKeyword(v);
                    if (v.trim() === "") {
                      debouncedSearch.cancel();
                      fetchCases("");
                    } else {
                      debouncedSearch(v);
                    }
                  }}
                />
              </div>
              <ExecutionCaseFilterBar
                items={executionFilterItems}
                activeKey={executionFilterKey}
                onChange={setExecutionFilterKey}
              />
              {listLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spin />
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-2">
                  <div className="text-red-800 text-sm">{error}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1 min-h-0">
                  <div
                    ref={leftRef}
                    className="flex-1 min-h-0 overflow-y-auto vertical-scrollbar scrollbar-sm flex flex-col gap-3 pr-2 pl-1 py-1"
                    style={{ scrollbarGutter: "stable" }}
                  >
                    {filteredCases.length === 0 ? (
                      <div className="text-secondary py-12 text-center">
                        {isExecutionFiltering && cases.length > 0 ? "暂无匹配的筛选结果" : "暂无数据"}
                      </div>
                    ) : (
                      filteredCases.map((item) => {
                        const caseId = String(item.case);
                        const isActive = String(selectedCaseId || "") === caseId;
                        const assigneeName =
                          (item.assignees ?? [])
                            .map((id) => getUserDetails(String(id))?.display_name || "未知用户")
                            .join("、") || "未分配";
                        return (
                          <Card
                            key={item.id}
                            data-case-id={caseId}
                            variant="outlined"
                            hoverable
                            onClick={() => {
                              setSelectedCaseId(caseId);
                              fetchCaseDetail(caseId);
                            }}
                            className={`${isActive ? "ring-2 ring-accent-strong" : ""} rounded-md hover:shadow-sm transition-shadow`}
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm leading-5 font-medium truncate">{item.name}</div>
                                <Tag color={(enumsData?.plan_case_result || {})[String(item.result)]}>
                                  {item.result || "-"}
                                </Tag>
                              </div>
                              <div className="text-xs leading-4 text-secondary truncate">执行人: {assigneeName}</div>
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </Col>

          <Col flex="auto" className="flex flex-col min-h-0" style={{ maxHeight: `calc(100dvh - ${topOffset}px)` }}>
            <div className="flex flex-col flex-1 min-h-0">
              <div
                ref={rightRef}
                className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm"
                style={{ scrollPaddingBottom: 80 }}
              >
                <div className="p-4" style={{ scrollPaddingBottom: 16 }}>
                  {!selectedCaseId ? (
                    <div className="text-secondary py-12 text-center">请从左侧选择一个用例</div>
                  ) : detailLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Spin />
                    </div>
                  ) : !caseDetail ? (
                    <div className="text-secondary py-12 text-center">未获取到用例详情</div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div>
                        <TitleInput
                          disabled
                          value={String(caseDetail?.name ?? "")}
                          onChange={() => {}}
                          onBlur={() => {}}
                          code={String(caseDetail?.code ?? "")}
                        />
                        <CaseMetaForm
                          disabled
                          projectId={projectId ? String(projectId) : undefined}
                          assignee={normalizeId(caseDetail?.assignee)}
                          onAssigneeChange={() => {}}
                          onAssigneeBlur={() => {}}
                          assigneeOptions={[]}
                          stateValue={undefined}
                          onStateChange={() => {}}
                          onStateBlur={() => {}}
                          caseStateOptions={[]}
                          typeValue={normalizeId(caseDetail?.type)}
                          onTypeChange={() => {}}
                          onTypeBlur={() => {}}
                          caseTypeOptions={caseTypeOptions}
                          priorityValue={normalizeId(caseDetail?.priority)}
                          onPriorityChange={() => {}}
                          onPriorityBlur={() => {}}
                          casePriorityOptions={casePriorityOptions}
                          labelList={Array.isArray(caseDetail?.labels) ? caseDetail.labels : []}
                        />
                      </div>
                      <div className="border-b border-gray-200">
                        <nav className="flex gap-4 overflow-x-auto">
                          {(
                            [
                              { key: "basic", label: "基本信息" },
                              { key: "req-link", label: "需求" },
                              { key: "work", label: "工作项" },
                              { key: "defect", label: "缺陷" },
                              { key: "history", label: "执行" },
                              { key: "review", label: "评审" },
                              { key: "attachment", label: "附件" },
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setActiveTab(tab.key)}
                              className={`px-2 py-3 text-sm leading-5 font-medium -mb-px border-b-2 whitespace-nowrap transition-colors ${
                                activeTab === tab.key
                                  ? "text-accent-primary border-accent-strong"
                                  : "text-secondary border-transparent hover:text-accent-primary"
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </nav>
                      </div>

                      <div className="min-h-[550px]">
                        <Transition
                          show={activeTab === "basic"}
                          enter="transition duration-150 ease-out"
                          enterFrom="transform scale-95 opacity-0"
                          enterTo="transform scale-100 opacity-100"
                          leave="transition duration-100 ease-in"
                          leaveFrom="transform scale-100 opacity-100"
                          leaveTo="transform scale-95 opacity-0"
                        >
                          {activeTab === "basic" && (
                            <div className="flex flex-col gap-4 min-h-[550px]">
                              <div>
                                <label className="mb-3 flex items-center gap-2 text-sm leading-5 font-medium text-secondary">
                                  前置条件
                                </label>
                                <RichTextEditor
                                  value={String(caseDetail?.precondition ?? "")}
                                  onChange={() => {}}
                                  onBlur={() => {}}
                                  aria-label="前置条件"
                                  placeholder="暂无内容"
                                  editable={false}
                                  readonlyTextClassName="text-sm leading-5 text-primary"
                                />
                              </div>

                              {stepViewMode === 1 ? (
                                <>
                                  <div>
                                    <div className="mb-2 flex items-center justify-between gap-6">
                                      <label className="flex items-center gap-2 text-sm leading-5 font-medium text-secondary">
                                        文本描述
                                      </label>
                                      <StepTypeSwitcher mode={stepViewMode} onChange={setStepViewMode} />
                                    </div>
                                    <RichTextEditor
                                      value={String(caseDetail?.text_description ?? "")}
                                      onChange={() => {}}
                                      onBlur={() => {}}
                                      aria-label="文本描述"
                                      placeholder="暂无内容"
                                      editable={false}
                                      readonlyTextClassName="text-sm leading-5 text-primary"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-2 flex items-center gap-2 text-sm leading-5 font-medium text-secondary">
                                      预期结果
                                    </label>
                                    <RichTextEditor
                                      value={String(caseDetail?.text_result ?? "")}
                                      onChange={() => {}}
                                      onBlur={() => {}}
                                      aria-label="预期结果"
                                      placeholder="暂无内容"
                                      editable={false}
                                      readonlyTextClassName="text-sm leading-5 text-primary"
                                    />
                                  </div>
                                </>
                              ) : (
                                <div>
                                  <div className="mb-2 flex items-center justify-between gap-6">
                                    <label className="flex items-center gap-2 text-sm leading-5 font-medium text-secondary">
                                      测试步骤
                                    </label>
                                    <StepTypeSwitcher mode={stepViewMode} onChange={setStepViewMode} />
                                  </div>
                                  <StepsTable
                                    steps={displaySteps}
                                    actualMap={stepActualResultMap}
                                    execMap={stepExecResultMap}
                                    onChangeActual={handleChangeActual}
                                    onChangeExec={handleChangeExec}
                                  />
                                </div>
                              )}

                              <div>
                                <label className="mb-2 flex items-center gap-2 text-sm leading-5 font-medium text-secondary">
                                  备注
                                </label>
                                <RichTextEditor
                                  value={caseDetail?.remark}
                                  onChange={() => {}}
                                  onBlur={() => {}}
                                  aria-label="备注"
                                  placeholder="暂无内容"
                                  editable={false}
                                  readonlyTextClassName="text-sm leading-5 text-primary"
                                />
                              </div>

                            </div>
                          )}
                        </Transition>

                        <Transition
                          show={activeTab === "req-link"}
                          enter="transition duration-150 ease-out"
                          enterFrom="transform scale-95 opacity-0"
                          enterTo="transform scale-100 opacity-100"
                          leave="transition duration-100 ease-in"
                          leaveFrom="transform scale-100 opacity-100"
                          leaveTo="transform scale-95 opacity-0"
                        >
                          {activeTab === "req-link" && selectedCaseId && (
                            <div className="min-h-[550px]">
                              <RequirementDisplayPanel
                                caseId={String(selectedCaseId)}
                                projectId={projectId ? String(projectId) : undefined}
                                canEdit={false}
                              />
                            </div>
                          )}
                        </Transition>

                        <Transition
                          show={activeTab === "work"}
                          enter="transition duration-150 ease-out"
                          enterFrom="transform scale-95 opacity-0"
                          enterTo="transform scale-100 opacity-100"
                          leave="transition duration-100 ease-in"
                          leaveFrom="transform scale-100 opacity-100"
                          leaveTo="transform scale-95 opacity-0"
                        >
                          {activeTab === "work" && selectedCaseId && (
                            <div className="-mt-7 min-h-[550px]">
                              <WorkItemDisplayModal caseId={String(selectedCaseId)} defaultType="Task" />
                            </div>
                          )}
                        </Transition>

                        <Transition
                          show={activeTab === "defect"}
                          enter="transition duration-150 ease-out"
                          enterFrom="transform scale-95 opacity-0"
                          enterTo="transform scale-100 opacity-100"
                          leave="transition duration-100 ease-in"
                          leaveFrom="transform scale-100 opacity-100"
                          leaveTo="transform scale-95 opacity-0"
                        >
                          {activeTab === "defect" && selectedCaseId && (
                            <div className="-mt-7 min-h-[550px]">
                              <WorkItemDisplayModal
                                caseId={String(selectedCaseId)}
                                defaultType="Bug"
                                reloadToken={recordsRefreshKey}
                              />
                            </div>
                          )}
                        </Transition>

                        <Transition
                          show={activeTab === "attachment"}
                          enter="transition duration-150 ease-out"
                          enterFrom="transform scale-95 opacity-0"
                          enterTo="transform scale-100 opacity-100"
                          leave="transition duration-100 ease-in"
                          leaveFrom="transform scale-100 opacity-100"
                          leaveTo="transform scale-95 opacity-0"
                        >
                          {activeTab === "attachment" && (
                            <div id="attachments-section" className="min-h-[550px] scroll-mb-16">
                              {attachments.length === 0 ? (
                                <div className="p-3 text-sm text-secondary">暂无附件</div>
                              ) : (
                                <Table
                                  size="small"
                                  pagination={false}
                                  rowKey={(r: any) => String(r?.id)}
                                  dataSource={attachments}
                                  columns={[
                                    {
                                      title: "文件名",
                                      dataIndex: ["attributes", "name"],
                                      key: "name",
                                      render: (_: any, record: any) => (
                                        <span className="truncate block max-w-[480px]">
                                          {String(record?.attributes?.name || record?.filename || record?.id)}
                                        </span>
                                      ),
                                    },
                                    {
                                      title: "操作",
                                      key: "action",
                                      width: 120,
                                      render: (_: any, record: any) => (
                                        <Tooltip title="下载">
                                          <Button type="link" size="small" onClick={() => handleDownloadAttachment(record)}>
                                            下载
                                          </Button>
                                        </Tooltip>
                                      ),
                                    },
                                  ]}
                                />
                              )}
                            </div>
                          )}
                        </Transition>

                        <Transition
                          show={activeTab === "history"}
                          enter="transition duration-150 ease-out"
                          enterFrom="transform scale-95 opacity-0"
                          enterTo="transform scale-100 opacity-100"
                          leave="transition duration-100 ease-in"
                          leaveFrom="transform scale-100 opacity-100"
                          leaveTo="transform scale-95 opacity-0"
                        >
                          {activeTab === "history" && (
                            <ExecutionRecordsPanel
                              key={`${selectedCaseId}-${recordsRefreshKey}`}
                              workspaceSlug={workspaceSlug}
                              reviewId={reviewId}
                              caseId={selectedCaseId}
                            />
                          )}
                        </Transition>

                        <Transition
                          show={activeTab === "review"}
                          enter="transition duration-150 ease-out"
                          enterFrom="transform scale-95 opacity-0"
                          enterTo="transform scale-100 opacity-100"
                          leave="transition duration-100 ease-in"
                          leaveFrom="transform scale-100 opacity-100"
                          leaveTo="transform scale-95 opacity-0"
                        >
                          {activeTab === "review" && selectedCaseId && (
                            <div className="min-h-[550px]">
                              <CaseReviewRecordsTable
                                workspaceSlug={String(workspaceSlug ?? "")}
                                caseId={String(selectedCaseId)}
                              />
                            </div>
                          )}
                        </Transition>

                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedCaseId && !detailLoading && caseDetail && activeTab === "basic" ? (
                <div className="sticky bottom-0 w-full shrink-0 bg-surface-1" style={{ borderTop: "1px solid #f0f0f0" }}>
                  <div className="p-4">
                    <div className="px-0 py-3 flex flex-col gap-3">
                      <Radio.Group onChange={handleRadioChange} value={reviewValue} disabled={!selectedCaseId || !isCurrentUserReviewer}>
                        {Object.keys(enumsData?.plan_case_result || {})
                          .filter((k) => k !== "未执行")
                          .map((k, idx) => (
                            <Radio key={k} value={k} className={idx > 0 ? "ml-6" : undefined}>
                              <Tag color={(enumsData?.plan_case_result || {})[k]}>{k}</Tag>
                            </Radio>
                          ))}
                      </Radio.Group>
                      <div
                        onDoubleClick={() => {
                          setReasonDraft(reason);
                          setReasonModalOpen(true);
                        }}
                      >
                        <Input.TextArea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          autoSize={{ minRows: 1, maxRows: 1 }}
                          placeholder="请输入原因（双击可全屏输入）"
                          allowClear
                          disabled={!isCurrentUserReviewer}
                          className="resize-none"
                          onKeyDownCapture={(e) => {
                            if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Escape" || e.key === "Tab") return;
                            e.stopPropagation();
                          }}
                        />
                      </div>
                      {!isCurrentUserReviewer && (
                        <div className="text-xs text-danger-primary">当前用例仅执行人可提交执行结果</div>
                      )}
                      {pendingFiles.length > 0 && (
                        <div className="rounded-md border border-subtle bg-layer-1/60 px-3 py-2">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-secondary">
                              <span className="flex size-5 items-center justify-center rounded bg-surface-1 text-accent-primary">
                                <LucideIcons.Paperclip size={13} />
                              </span>
                              <span>待上传附件</span>
                              <span className="text-placeholder">提交结果成功后自动绑定</span>
                            </div>
                            <span className="text-xs text-placeholder">共 {pendingFiles.length} 个</span>
                          </div>
                          <div className="flex max-h-20 flex-wrap gap-2 overflow-y-auto vertical-scrollbar scrollbar-sm pr-1">
                            {pendingFiles.map((pf) => (
                              <Tooltip key={pf.id} title={`${pf.file.name}（${formatFileSize(pf.file.size)}）`}>
                                <div className="group flex max-w-[260px] items-center gap-2 rounded border border-subtle bg-surface-1 px-2 py-1.5 text-xs shadow-sm transition-colors hover:border-accent-strong">
                                  <LucideIcons.FileText size={13} className="shrink-0 text-secondary" />
                                  <div className="min-w-0">
                                    <div className="truncate text-primary">{pf.file.name}</div>
                                    <div className="text-[11px] leading-4 text-placeholder">{formatFileSize(pf.file.size)}</div>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label="移除附件"
                                    onClick={() => removePendingFile(pf.id)}
                                    className="ml-1 flex size-4 shrink-0 items-center justify-center rounded text-placeholder transition-colors hover:bg-layer-2 hover:text-danger-primary"
                                  >
                                    <LucideIcons.X size={12} />
                                  </button>
                                </div>
                              </Tooltip>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSubmitReview}
                            disabled={!selectedCaseId || submitLoading || !isCurrentUserReviewer}
                            className="text-on-color bg-accent-primary hover:bg-accent-primary-hover focus:text-on-color focus:bg-accent-primary-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {submitLoading ? "提交中..." : "提交结果"}
                          </button>
                          <Tooltip title="为当前用例创建一个缺陷工作项">
                            <button
                              type="button"
                              onClick={handleOpenCreateDefect}
                              disabled={!workspaceSlug}
                              className="text-on-color bg-accent-primary hover:bg-accent-primary-hover focus:text-on-color focus:bg-accent-primary-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              新增缺陷
                            </button>
                          </Tooltip>
                          <Tooltip title="附件将在提交结果成功后才上传并绑定">
                            <Upload
                              multiple
                              showUploadList={false}
                              beforeUpload={(file) => {
                                addPendingFile(file as unknown as File);
                                return false;
                              }}
                            >
                              <button
                                type="button"
                                disabled={!selectedCaseId || !isCurrentUserReviewer}
                                className="border border-subtle text-secondary hover:bg-layer-1 px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <LucideIcons.Paperclip size={13} />
                                上传附件
                              </button>
                            </Upload>
                          </Tooltip>
                          <Checkbox checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)}>
                            执行后自动切换下一条
                          </Checkbox>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </Col>
        </Row>
      </Transition>
      <Modal
        title="执行原因"
        open={reasonModalOpen}
        cancelText="取消"
        okText="确定"
        onCancel={() => setReasonModalOpen(false)}
        onOk={() => {
          setReason(reasonDraft);
          setReasonModalOpen(false);
        }}
        destroyOnHidden
        width={600}
      >
        <Input.TextArea
          value={reasonDraft}
          onChange={(e) => setReasonDraft(e.target.value)}
          rows={4}
          placeholder="请输入原因"
          allowClear
          onKeyDownCapture={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Escape" || e.key === "Tab") return;
            e.stopPropagation();
          }}
        />
      </Modal>
      <BugIssueModal
        isOpen={isCreateDefectOpen}
        onClose={() => setIsCreateDefectOpen(false)}
        modalTitle="新增缺陷"
        isDraft={false}
        initialDescriptionHtml={buildStepsHtml()}
        data={{ project_id: projectId }}
        isProjectSelectionDisabled={true}
        onSubmit={async (res) => {
          try {
            setIsCreateDefectOpen(false);
            if (activeTab === "defect") setRecordsRefreshKey((k) => k + 1);
            message.success("缺陷创建成功");
            const bugId = String((res as any)?.id ?? "");
            const caseId = String(selectedCaseId ?? "");
            if (workspaceSlug && bugId && caseId) {
              const plan = new PlanApiService();
              await plan.addCaseBug(String(workspaceSlug), { case_id: caseId, issue_id: bugId });
              message.success("已绑定缺陷与用例");
            }
          } catch (e: any) {
            const msg = e?.message || e?.detail || e?.error || "缺陷创建或绑定失败";
            message.error(msg);
          }
        }}
      />
    </div>
  );
}
