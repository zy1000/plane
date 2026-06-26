"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { Button } from "antd";
import { Button as PlaneButton } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import PlanCasesModal from "@/components/qa/plans/plan-cases-modal";
import PlanIterationModal from "@/components/qa/plans/plan-iteration-modal";
import PlanReleaseModal from "@/components/qa/plans/plan-release-modal";
import PlanCasesExportModal from "@/components/qa/plans/plan-cases-export-modal";
import UpdateModal from "@/components/qa/cases/update-modal";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { Tree, Table, Space, Tag, message, Dropdown, Pagination, Popconfirm, Select } from "antd";
import type { TableProps } from "antd";
import type { TreeProps } from "antd";
import { CaseService } from "@/services/qa/case.service";
import { PlanService } from "@/services/qa/plan.service";
import { AppstoreOutlined } from "@ant-design/icons";
import { FolderOpenDot, Atom, UserCog, CheckCheck, Unlink, X, Loader2 } from "lucide-react";
import { formatDateTime, globalEnums } from "../util";
import { useUser } from "@/hooks/store/user";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useTranslation } from "@plane/i18n";
import { qaCaseErrorContent, qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";
import { ChevronDownIcon } from "@plane/propel/icons";

type TLabel = { id?: string; name?: string } | string;
type TestCase = {
  id: string;
  code?: string;
  name: string;
  remark?: string;
  state?: number;
  type?: number;
  priority?: number;
  created_at?: string;
  updated_at?: string;
  repository?: string;
  labels?: TLabel[];
  module?: string;
  repository_name?: string;
  assignee?: { id?: string } | null;
};
type PlanCaseItem = {
  id: string;
  assignee?: string | null;
  result?: string;
  case?: TestCase;
};
type PlanCaseResponse = { count: number; data: PlanCaseItem[] };

export default function PlanCasesPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams.get("planId");
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryName = typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryName") : "";
  const planName = typeof window !== "undefined" ? sessionStorage.getItem("selectedPlanName") : "";
  const Enums = globalEnums.Enums;

  const planService = useRef(new PlanService()).current;
  const caseService = useRef(new CaseService()).current;
  const { data: currentUser } = useUser();

  const [expandedKeys, setExpandedKeys] = useState<string[] | undefined>(undefined);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [planTree, setPlanTree] = useState<any | null>(null);

  const [cases, setCases] = useState<PlanCaseItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [ordering, setOrdering] = useState<string | undefined>(undefined);
  const [selectedResults, setSelectedResults] = useState<string[] | undefined>(undefined);

  const [activeCase, setActiveCase] = useState<TestCase | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isIterationModalOpen, setIsIterationModalOpen] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [selectedPlanCaseToCaseIdMap, setSelectedPlanCaseToCaseIdMap] = useState<Record<string, string>>({});
  const [selectedPlanCaseToAssigneeMap, setSelectedPlanCaseToAssigneeMap] = useState<Record<string, string | null>>({});
  const [bulkExecuteLoading, setBulkExecuteLoading] = useState<boolean>(false);
  const [bulkAssigneeUpdating, setBulkAssigneeUpdating] = useState<boolean>(false);
  const [updatingAssigneePlanCaseId, setUpdatingAssigneePlanCaseId] = useState<string | null>(null);

  const [planList, setPlanList] = useState<Array<{ id: string; name: string }>>([]);
  const [planListLoading, setPlanListLoading] = useState<boolean>(false);

  const selectionContextKey = useMemo(() => {
    return JSON.stringify({
      planId,
      selectedRepositoryId,
      selectedModuleId,
      ordering,
      selectedResults,
    });
  }, [planId, selectedRepositoryId, selectedModuleId, ordering, selectedResults]);
  const lastSelectionContextKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      lastSelectionContextKeyRef.current !== null &&
      lastSelectionContextKeyRef.current !== selectionContextKey
    ) {
      setSelectedCaseIds([]);
      setSelectedPlanCaseToCaseIdMap({});
      setSelectedPlanCaseToAssigneeMap({});
    }
    lastSelectionContextKeyRef.current = selectionContextKey;
  }, [selectionContextKey]);

  const dropdownItems = [
    { key: "by_iteration", label: "通过迭代规划" },
    { key: "by_release", label: "通过发布规划" },
  ];

  useEffect(() => {
    if (!workspaceSlug || !planId) return;
    setLoading(true);
    fetchPlanTree();
    fetchCases(1, pageSize, undefined, undefined);
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
  }, [workspaceSlug, planId]);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    setPlanListLoading(true);
    planService
      .getPlanList(String(workspaceSlug), { project_id: String(projectId) })
      .then((data) => setPlanList(Array.isArray(data) ? data : []))
      .catch(() => setPlanList([]))
      .finally(() => setPlanListLoading(false));
  }, [workspaceSlug, projectId]);

  const onChangePlan = (nextPlanId: string) => {
    const found = planList.find((p) => String(p.id) === String(nextPlanId));
    if (typeof window !== "undefined") {
      if (found?.name) sessionStorage.setItem("selectedPlanName", String(found.name));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("planId", String(nextPlanId));
    router.push(`/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?${params.toString()}`);
  };

  const fetchPlanTree = async () => {
    if (!workspaceSlug || !planId) return;
    try {
      const data = await caseService.getPlanCaseTree(String(workspaceSlug), { plan_id: String(planId) });
      setPlanTree(data || null);
      setExpandedKeys(data ? collectDefaultExpandedKeys(data) : undefined);
      setAutoExpandParent(true);
    } catch {}
  };

  const fetchCases = async (
    page: number,
    size: number,
    repoId?: string,
    moduleId?: string,
    orderingParam?: string | null,
    resultsParam?: string[] | null
  ) => {
    if (!workspaceSlug || !planId) return;
    try {
      setError(null);
      const effectiveOrdering = orderingParam === undefined ? ordering : orderingParam ?? undefined;
      const effectiveResults =
        resultsParam === undefined ? selectedResults : resultsParam === null ? undefined : resultsParam;
      const params: any = {
        page,
        page_size: size,
        plan_id: planId,
      };
      if (repoId) params["case__repository_id"] = repoId;
      if (moduleId) params["case__module_id"] = moduleId;
      if (effectiveOrdering) params.ordering = effectiveOrdering;
      if (effectiveResults && effectiveResults.length > 0) params.result__in = effectiveResults.join(",");
      const response: PlanCaseResponse = await planService.getPlanCases(workspaceSlug as string, params);
      setCases(response?.data || []);
      setTotal(response?.count || 0);
      setCurrentPage(page);
      setPageSize(size);
    } catch (e: unknown) {
      const fallback = "用例加载失败";
      setError(qaCaseErrorContent(e, t, fallback));
      qaCaseSetToastError(e, t, fallback);
    } finally {
      setLoading(false);
    }
  };

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const key = Array.isArray(selectedKeys) && selectedKeys.length > 0 ? String(selectedKeys[0]) : "root";
    setSelectedTreeKey(key);

    const node: any = (info as any)?.node || {};
    const kind = node?.kind as string | undefined;

    if (!kind || kind === "root") {
      setSelectedRepositoryId(null);
      setSelectedModuleId(null);
      fetchCases(1, pageSize, undefined, undefined);
      return;
    }

    if (kind === "repository" || kind === "repository_modules_all") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(null);
      fetchCases(1, pageSize, repoId || undefined, undefined);
      return;
    }

    if (kind === "module") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      const moduleId = node?.moduleId ? String(node.moduleId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(moduleId);
      fetchCases(1, pageSize, repoId || undefined, moduleId || undefined);
    }
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    const nextPage = nextSize !== pageSize ? 1 : page;
    fetchCases(nextPage, nextSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
  };

  const handleTableChange: TableProps<PlanCaseItem>["onChange"] = (_pagination, tableFilters, sorter) => {
    const sorterValue = Array.isArray(sorter) ? sorter[0] : sorter;
    const sorterField = String((sorterValue as any)?.field ?? "");
    const sorterOrder = (sorterValue as any)?.order as "ascend" | "descend" | undefined;

    const nextResultFiltersRaw = (tableFilters?.result as (string | number)[] | undefined) || [];
    const nextResultFilters = nextResultFiltersRaw.map((v) => String(v)).filter(Boolean);
    const nextSelectedResults = nextResultFilters.length > 0 ? nextResultFilters : undefined;
    setSelectedResults(nextSelectedResults);

    const nextOrdering =
      sorterField === "updated_at"
        ? sorterOrder === "ascend"
          ? "case__updated_at"
          : sorterOrder === "descend"
            ? "-case__updated_at"
            : undefined
        : sorterField === "code"
          ? sorterOrder === "ascend"
            ? "case__code"
            : sorterOrder === "descend"
              ? "-case__code"
              : undefined
        : undefined;

    setOrdering(nextOrdering);
    fetchCases(
      1,
      pageSize,
      selectedRepositoryId || undefined,
      selectedModuleId || undefined,
      nextOrdering ?? null,
      nextSelectedResults ?? null
    );
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const [leftWidth, setLeftWidth] = useState<number>(280);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const onMouseDownResize = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
    window.addEventListener("mousemove", onMouseMoveResize as any);
    window.addEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };
  const onMouseMoveResize = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const next = Math.min(320, Math.max(200, startWidthRef.current + (e.clientX - startXRef.current)));
    setLeftWidth(next);
  };
  const onMouseUpResize = () => {
    isDraggingRef.current = false;
    window.removeEventListener("mousemove", onMouseMoveResize as any);
    window.removeEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "auto";
    document.body.style.userSelect = "auto";
  };

  useEffect(
    () => () => {
      window.removeEventListener("mousemove", onMouseMoveResize as any);
      window.removeEventListener("mouseup", onMouseUpResize as any);
    },
    []
  );

  const renderNodeTitle = (title: string, icon: ReactNode, count?: number, fontMedium?: boolean) => {
    return (
      <div className="group flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 text-secondary">
            {icon}
          </span>
          <span className={`text-sm text-primary ${fontMedium ? "font-medium" : ""}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && <span className="text-xs text-secondary">{count}</span>}
        </div>
      </div>
    );
  };

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
        <Atom size={14} />
      ) : kind === "repository_modules_all" ? (
        <AppstoreOutlined />
      ) : (
        <FolderOpenDot size={14} />
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

  const treeData = useMemo(() => {
    if (!planTree) return [];
    return [buildTreeNodes(planTree)];
  }, [planTree]);

  const onCancelRelation = async (ids: string | string[]) => {
    if (!workspaceSlug || !planId) return;
    try {
      await planService.cancelPlanCase(String(workspaceSlug), String(projectId), ids);
      if (Array.isArray(ids)) {
        setSelectedCaseIds([]);
        setSelectedPlanCaseToCaseIdMap({});
        setSelectedPlanCaseToAssigneeMap({});
      }
      await fetchPlanTree();
      await fetchCases(
        1,
        pageSize,
        selectedRepositoryId || undefined,
        selectedModuleId || undefined
      );
      qaCaseSetToastSuccess("取消关联成功");
    } catch (e: unknown) {
      const fallback = "取消关联失败";
      qaCaseSetToastError(e, t, fallback);
    }
  };

  const getSuccessResultLabel = () => {
    const map = (Enums as any)?.plan_case_result || {};
    const keys = Object.keys(map);
    if (keys.includes("通过")) return "通过";
    if (keys.includes("成功")) return "成功";
    const filtered = keys.filter((k) => k !== "未执行");
    return filtered[0] ?? "通过";
  };

  const handleOpenCaseDetail = (caseId?: string) => {
    if (!caseId) {
      qaCaseSetToastWarning("缺少用例信息，无法打开");
      return;
    }
    setActiveCase({ id: caseId, name: "" });
    setIsUpdateModalOpen(true);
  };

  const onBulkExecuteSelected = async () => {
    if (!workspaceSlug || !planId) return;
    if (!currentUser?.id) {
      message.warning("缺少用户信息，无法提交执行结果");
      return;
    }
    const currentUserId = String(currentUser.id);
    const unauthorizedPlanCases = selectedCaseIds.filter((planCaseId) => {
      const assigned = selectedPlanCaseToAssigneeMap[String(planCaseId)];
      return !assigned || String(assigned) !== currentUserId;
    });
    if (unauthorizedPlanCases.length > 0) {
      message.warning("选中用例中包含非本人执行项或未设置执行人的项，请调整后重试");
      return;
    }
    const caseIds = Array.from(
      new Set(selectedCaseIds.map((planCaseId) => selectedPlanCaseToCaseIdMap[String(planCaseId)]).filter(Boolean))
    );
    if (caseIds.length === 0) {
      message.warning("未找到选中用例的 case_id");
      return;
    }

    setBulkExecuteLoading(true);
    const successLabel = getSuccessResultLabel();
    try {
      const stepGroups = await Promise.all(
        caseIds.map(async (cid) => {
          let detail: any = null;
          try {
            detail = await planService.getPlanCaseDetail(String(workspaceSlug), {
              plan_id: String(planId),
              case_id: String(cid),
            });
          } catch {
            detail = await caseService.getCase(String(workspaceSlug), String(cid));
          }
          const chosenSteps =
            Array.isArray(detail?.execute_steps) && detail.execute_steps.length > 0
              ? (detail.execute_steps as any[])
              : Array.isArray(detail?.steps)
                ? (detail.steps as any[])
                : [];
          const stepsPayload = (chosenSteps || []).map((s: any) => ({
            description: String(s?.description ?? ""),
            result: String(s?.result ?? ""),
            actual_result: String(s?.actual_result ?? ""),
            exec_result: successLabel,
          }));
          return { case_id: String(cid)};
        })
      );

      const payload: any = {
        plan_id: String(planId),
        case_id: caseIds.map(String),
        result: successLabel,
        assignee: String(currentUser.id),
        issue_ids: [],
      };
      await planService.caseExecute(String(workspaceSlug), payload);
      message.success("批量执行结果提交成功");
      setSelectedCaseIds([]);
      setSelectedPlanCaseToCaseIdMap({});
      setSelectedPlanCaseToAssigneeMap({});
      await fetchPlanTree();
      await fetchCases(currentPage, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "批量提交结果失败";
      message.error(msg);
    } finally {
      setBulkExecuteLoading(false);
    }
  };

  const handlePlanCaseAssigneeChange = async (planCaseId: string, assignee: string | null) => {
    if (!workspaceSlug || !projectId) return;
    try {
      setUpdatingAssigneePlanCaseId(String(planCaseId));
      const updated = await planService.updatePlanCaseAssignee(String(workspaceSlug), String(projectId), {
        plan_case_id: String(planCaseId),
        assignee,
      });
      const nextAssignee = updated?.assignee ?? assignee;
      setCases((prev) =>
        (prev || []).map((item) =>
          String(item.id) === String(planCaseId) ? { ...item, assignee: nextAssignee ? String(nextAssignee) : null } : item
        )
      );
      setSelectedPlanCaseToAssigneeMap((prev) => ({
        ...(prev || {}),
        [String(planCaseId)]: nextAssignee ? String(nextAssignee) : null,
      }));
      qaCaseSetToastSuccess("执行人已更新");
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "更新执行人失败");
    } finally {
      setUpdatingAssigneePlanCaseId(null);
    }
  };

  const handleBulkPlanCaseAssigneeChange = async (assignee: string | null) => {
    if (!workspaceSlug || !projectId) return;
    const targetPlanCaseIds = Array.from(new Set((selectedCaseIds || []).map((id) => String(id))));
    if (targetPlanCaseIds.length === 0) {
      qaCaseSetToastWarning("请先选择用例");
      return;
    }

    try {
      setBulkAssigneeUpdating(true);
      const settledResults = await Promise.allSettled(
        targetPlanCaseIds.map((planCaseId) =>
          planService.updatePlanCaseAssignee(String(workspaceSlug), String(projectId), {
            plan_case_id: String(planCaseId),
            assignee,
          })
        )
      );

      const successPlanCaseIds: string[] = [];
      const failedErrors: unknown[] = [];
      settledResults.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          successPlanCaseIds.push(targetPlanCaseIds[idx]);
        } else {
          failedErrors.push(result.reason);
        }
      });

      if (successPlanCaseIds.length > 0) {
        const successIdSet = new Set(successPlanCaseIds.map((id) => String(id)));
        const nextAssignee = assignee ? String(assignee) : null;

        setCases((prev) =>
          (prev || []).map((item) => (successIdSet.has(String(item.id)) ? { ...item, assignee: nextAssignee } : item))
        );
        setSelectedPlanCaseToAssigneeMap((prev) => {
          const next = { ...(prev || {}) } as Record<string, string | null>;
          successPlanCaseIds.forEach((planCaseId) => {
            next[String(planCaseId)] = nextAssignee;
          });
          return next;
        });
      }

      if (failedErrors.length === 0) {
        qaCaseSetToastSuccess("批量更新执行人成功");
      } else if (successPlanCaseIds.length > 0) {
        message.warning(`已更新 ${successPlanCaseIds.length} 条，${failedErrors.length} 条失败`);
      } else {
        qaCaseSetToastError(failedErrors[0], t, "批量更新执行人失败");
      }
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "批量更新执行人失败");
    } finally {
      setBulkAssigneeUpdating(false);
    }
  };

  const columns: TableProps<PlanCaseItem>["columns"] = [
    {
      title: "用例编号",
      dataIndex: "code",
      key: "code",
      width: 120,
      render: (_: any, record: PlanCaseItem) => {
        const code = record?.case?.code;
        const cid = record?.case?.id;
        return (
          <span className="block truncate" title={code || ""}>
            <Button
            type="text"
            className="p-0 h-auto text-primary hover:text-primary hover:bg-transparent"
            onClick={() => handleOpenCaseDetail(cid)}
          >
            {code}
          </Button>
          </span>
        );
      },
      sorter: true,
      sortOrder: ordering === "case__code" ? "ascend" : ordering === "-case__code" ? "descend" : null,
    },
    {
      title: "用例名称",
      dataIndex: "name",
      width: 240,
      key: "name",
      render: (_: any, record: PlanCaseItem) => {
        const name = record?.case?.name ?? "-";
        const cid = record?.case?.id;
        if (!cid) return name;

        return (
          <Button
            type="text"
            className="p-0 h-auto text-primary hover:text-primary hover:bg-transparent"
            onClick={() => handleOpenCaseDetail(cid)}
          >
         <span className="block max-w-[220px] truncate text-inherit" title={name || ""}>
            {name || "-"}
          </span>
          </Button>
        );
      },
    },
    {
      title: "用例库",
      dataIndex: "repository_name",
      key: "repository_name",
      width: 140,
      render: (_: any, record: PlanCaseItem) =>
        record?.case?.repository_name ? (
          <Tooltip tooltipContent={record.case.repository_name}>
            <span className="block max-w-[140px] truncate text-inherit">
              {record.case.repository_name}
            </span>
          </Tooltip>
        ) : (
          "-"
        ),
    },
    {
      title: "模块",
      dataIndex: "module",
      key: "module_name",
      width: 120,
      render: (_: any, record: PlanCaseItem) =>
        record?.case?.module ? (
          <Tooltip tooltipContent={record.case.module}>
            <span className="block max-w-[120px] truncate text-inherit">
              {record.case.module}
            </span>
          </Tooltip>
        ) : (
          "-"
        ),
    },
    {
      title: "执行人",
      dataIndex: "plan_assignee",
      key: "plan_assignee",
      width: 160,
      render: (_: any, record: PlanCaseItem) => (
        <MemberDropdown
          multiple={false}
          value={record?.assignee ?? null}
          onChange={(value) => handlePlanCaseAssigneeChange(String(record.id), value ? String(value) : null)}
          disabled={bulkAssigneeUpdating || updatingAssigneePlanCaseId === String(record.id)}
          projectId={projectId ? String(projectId) : undefined}
          placeholder="请选择执行人"
          className="w-full text-sm"
          buttonContainerClassName="w-full text-left p-0"
          buttonVariant="transparent-with-text"
          buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
          showUserDetails={true}
          optionsClassName="z-[80]"
        />
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (_: any, record: PlanCaseItem) => {
        const v = record?.case?.type as number;
        const label = Enums?.case_type?.[v] || "-";
        return <Tag>{label}</Tag>;
      },
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 100,
      render: (_: any, record: PlanCaseItem) => {
        const v = record?.case?.priority as number;
        const label = Enums?.case_priority?.[v] || "-";
        return <Tag>{label}</Tag>;
      },
    },
    {
      title: "执行结果",
      dataIndex: "result",
      key: "result",
      width: 120,
      filters: Object.keys((Enums as any)?.plan_case_result || {}).map((label) => ({ text: label, value: label })),
      filterMultiple: true,
      filteredValue: selectedResults ?? null,
      render: (_: any, record: PlanCaseItem) => {
        const label = record?.result || "-";
        const color = (Enums as any)?.plan_case_result?.[label];
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: (_: any, record: PlanCaseItem) =>
        record?.case?.updated_at ? formatDateTime(record.case.updated_at) : "-",
      sorter: true,
      sortOrder: ordering === "case__updated_at" ? "ascend" : ordering === "-case__updated_at" ? "descend" : null,
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
      render: (_: any, record: PlanCaseItem) => {
        const isAssignedToCurrentUser =
          Boolean(record?.assignee) &&
          Boolean(currentUser?.id) &&
          String(record.assignee) === String(currentUser?.id);
        const actionLabel = isAssignedToCurrentUser ? "执行" : "查看";
        return (
          <Space>
            <Tooltip tooltipContent={actionLabel}>
              <span>
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    const cid = record?.case?.id;
                    if (!cid) return;
                    router.push(
                      `/${workspaceSlug}/projects/${projectId}/testhub/test-execution?case_id=${encodeURIComponent(String(cid))}&plan_id=${encodeURIComponent(String(planId || ""))}`
                    );
                  }}
                >
                  {actionLabel}
                </Button>
              </span>
            </Tooltip>
            <Button size="small" type="link" danger onClick={() => onCancelRelation([record.id])}>
              取关
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div className="h-full w-full">
      <PageHead title="计划用例" description={repositoryName || ""} />
      <div className="flex h-full w-full flex-col">
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div
            className="relative h-full min-h-0 border-r border-subtle overflow-y-auto flex-shrink-0 pt-3 pl-3"
            style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}
          >
            <div
              onMouseDown={onMouseDownResize}
              className="absolute right-0 top-0 h-full w-2"
              style={{ cursor: "col-resize", zIndex: 10 }}
            />
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
                }
              `,
              }}
            />
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
              className="pb-2 pr-2 custom-tree-indent"
            />
          </div>
          <div className="flex-1 h-full min-h-0 overflow-hidden min-w-0">
            <div className="flex h-full flex-col min-w-0">
              <div className="px-0 py-3 flex items-center justify-between flex-shrink-0">
                <div>
                  <Breadcrumbs>
                    <Breadcrumbs.Item
                      component={
                        <BreadcrumbLink href={`/${workspaceSlug}/projects/${projectId}/testhub/plans`} label="测试计划" />
                      }
                    />
                    <Breadcrumbs.Item
                      component={
                        <div className="flex items-center h-full">
                          <Select
                            value={planId || undefined}
                            placeholder="选择测试计划"
                            loading={planListLoading}
                            size="small"
                            showSearch
                            optionFilterProp="label"
                            style={{ height: "100%" }}
                            className="min-w-[200px] h-full cursor-pointer [&_.ant-select-selector]:!p-0 [&_.ant-select-selector]:!h-full [&_.ant-select-selector]:!min-h-full [&_.ant-select-selector]:!items-center [&_.ant-select-selector]:!cursor-pointer [&_.ant-select-selection-wrap]:!h-full [&_.ant-select-selection-wrap]:!items-center [&_.ant-select-selection-wrap]:!flex [&_.ant-select-selection-search]:!h-full [&_.ant-select-selection-search-input]:!h-full [&_.ant-select-selection-item]:!leading-4 [&_.ant-select-selection-item]:!text-sm [&_.ant-select-selection-item]:!text-primary [&_.ant-select-selection-placeholder]:!leading-4 [&_.ant-select-selection-placeholder]:!text-sm [&_.ant-select-selection-placeholder]:!text-secondary"
                            variant="borderless"
                            suffixIcon={null}
                            showArrow={false}
                            options={planList.map((p) => ({ value: String(p.id), label: String(p.name || "-") }))}
                            onChange={onChangePlan}
                          />
                        </div>
                      }
                    />
                  </Breadcrumbs>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none">
                    <PlaneButton
                      variant="primary"
                      size="xl"
                      onClick={() => setIsPlanModalOpen(true)}
                    >
                      规划用例
                    </PlaneButton>
                    <Dropdown
                      menu={{
                        items: dropdownItems,
                        onClick: ({ key }) => {
                          if (key === "by_work_item") {
                            setIsPlanModalOpen(true);
                          } else if (key === "by_iteration") {
                            setIsIterationModalOpen(true);
                          } else if (key === "by_release") {
                            setIsReleaseModalOpen(true);
                          }
                        },
                      }}
                      trigger={["click"]}
                    >
                      <PlaneButton
                        variant="primary"
                        size="xl"
                        className="px-1"
                      >
                        <ChevronDownIcon className="h-4 w-4" />
                      </PlaneButton>
                    </Dropdown>
                  </div>
                  <Button
                    type="default"
                    className="px-3 text-accent-primary bg-transparent border border-accent-strong hover:bg-accent-subtle focus:text-accent-primary focus:bg-accent-subtle-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed mr-4"
                    onClick={() => setIsExportModalOpen(true)}
                    disabled={!planId}
                  >
                    导出
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden px-0 pb-3 min-w-0">
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-secondary">加载中...</div>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                    <div className="text-red-800 text-sm">{error}</div>
                  </div>
                )}
                {!loading && !error && (
                  <div className="flex flex-col h-full overflow-hidden min-w-0">
                    <div
                      className={`testhub-plan-cases-table-scroll flex-1 relative px-0 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-thumb]:rounded-full ${
                        pageSize === 100 ? "testhub-plan-cases-scrollbar-strong" : ""
                      }`}
                    >
                      <Table
                        dataSource={cases}
                        columns={columns}
                        rowKey={(row) => row.id}
                        bordered={false}
                        onChange={handleTableChange}
                        tableLayout="fixed"
                        pagination={false}
                        scroll={{ x: "max-content" }}
                        rowSelection={{
                          selectedRowKeys: selectedCaseIds,
                          preserveSelectedRowKeys: true,
                          onChange: (newSelectedRowKeys) => {
                            const nextSelectedKeys = (newSelectedRowKeys as (string | number)[]).map((k) => String(k));
                            const currentPageIds = (cases || []).map((row) => String(row.id));

                            setSelectedCaseIds((prev) => {
                              const next = new Set(prev.map((k) => String(k)));
                              for (const id of currentPageIds) next.delete(id);
                              for (const id of nextSelectedKeys) next.add(id);
                              return Array.from(next);
                            });

                            setSelectedPlanCaseToCaseIdMap((prev) => {
                              const next = { ...(prev || {}) } as Record<string, string>;
                              const currentPageSelected = new Set(
                                nextSelectedKeys.filter((k) => currentPageIds.includes(String(k)))
                              );
                              for (const pid of currentPageIds) {
                                if (!currentPageSelected.has(String(pid))) delete next[String(pid)];
                              }
                              for (const pid of Array.from(currentPageSelected)) {
                                const row = (cases || []).find((r) => String(r.id) === String(pid));
                                const cid = row?.case?.id;
                                if (cid) next[String(pid)] = String(cid);
                              }
                              return next;
                            });

                            setSelectedPlanCaseToAssigneeMap((prev) => {
                              const next = { ...(prev || {}) } as Record<string, string | null>;
                              const currentPageSelected = new Set(
                                nextSelectedKeys.filter((k) => currentPageIds.includes(String(k)))
                              );
                              for (const pid of currentPageIds) {
                                if (!currentPageSelected.has(String(pid))) delete next[String(pid)];
                              }
                              for (const pid of Array.from(currentPageSelected)) {
                                const row = (cases || []).find((r) => String(r.id) === String(pid));
                                next[String(pid)] = row?.assignee ? String(row.assignee) : null;
                              }
                              return next;
                            });
                          },
                        }}
                      />
                    </div>
                    <div className="flex-shrink-0 border-t border-subtle px-0 py-3 bg-surface-1 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm">
                        {selectedCaseIds.length > 0 && (
                          <div className="flex items-center gap-0.5">
                            <div className="flex items-center gap-2 pl-2 pr-1">
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-primary px-1.5 text-[11px] font-semibold leading-none text-white">
                                {selectedCaseIds.length}
                              </span>
                              <span className="whitespace-nowrap text-xs font-medium text-primary">已选择</span>
                            </div>

                            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[var(--border-color-subtle)]" />

                            <MemberDropdown
                              multiple={false}
                              value={null}
                              onChange={(value) => handleBulkPlanCaseAssigneeChange(value ? String(value) : null)}
                              disabled={bulkAssigneeUpdating}
                              projectId={projectId ? String(projectId) : undefined}
                              buttonVariant="transparent-with-text"
                              placement="top-start"
                              optionsClassName="z-[80]"
                              button={
                                <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-secondary transition-colors hover:bg-accent-subtle hover:text-accent-primary">
                                  {bulkAssigneeUpdating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <UserCog className="h-3.5 w-3.5" />
                                  )}
                                  {bulkAssigneeUpdating ? "更新中" : "分配执行人"}
                                </span>
                              }
                            />

                            <Popconfirm
                              title="确定将选中用例全部标记为执行成功？"
                              onConfirm={onBulkExecuteSelected}
                              okText="确定"
                              cancelText="取消"
                              okButtonProps={{ loading: bulkExecuteLoading }}
                            >
                              <button
                                type="button"
                                className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-subtle"
                              >
                                <CheckCheck className="h-3.5 w-3.5" />
                                执行
                              </button>
                            </Popconfirm>

                            <Popconfirm
                              title="确定取关选中用例？"
                              onConfirm={() => onCancelRelation(selectedCaseIds)}
                              okText="确定"
                              cancelText="取消"
                            >
                              <button
                                type="button"
                                className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                              >
                                <Unlink className="h-3.5 w-3.5" />
                                取关
                              </button>
                            </Popconfirm>

                            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[var(--border-color-subtle)]" />

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCaseIds([]);
                                setSelectedPlanCaseToCaseIdMap({});
                                setSelectedPlanCaseToAssigneeMap({});
                              }}
                              className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
                            >
                              <X className="h-3.5 w-3.5" />
                              清除
                            </button>
                          </div>
                        )}
                        <span className="text-secondary">
                          {total > 0
                            ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条`
                            : ""}
                        </span>
                      </div>
                      <Pagination
                        simple
                        current={currentPage}
                        pageSize={pageSize}
                        total={total}
                        showSizeChanger
                        pageSizeOptions={["10", "20", "50", "100"]}
                        onChange={handlePaginationChange}
                        onShowSizeChange={handlePaginationChange}
                        size="small"
                      />
                    </div>
                    <style
                      dangerouslySetInnerHTML={{
                        __html: `
                  .testhub-plan-cases-table-scroll{
                    scrollbar-gutter: stable both-edges;
                  }

                  .testhub-plan-cases-table-scroll .ant-table-thead > tr > th{
                    position: sticky;
                    top: 0;
                    z-index: 5;
                    background: var(--bg-surface-1);
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    color: var(--text-color-secondary) !important;
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong{
                    overflow-y: scroll;
                    scrollbar-width: auto;
                    scrollbar-color: var(--scrollbar-thumb) transparent;
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong::-webkit-scrollbar{
                    width: 12px;
                    height: 12px;
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong::-webkit-scrollbar-thumb{
                    background-color: color-mix(in oklch, var(--scrollbar-thumb) 85%, transparent);
                    border-radius: 999px;
                    border: 3px solid var(--bg-surface-1);
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong::-webkit-scrollbar-track{
                    background: transparent;
                  }

                  .testhub-plan-cases-table-scroll .ant-table-content::-webkit-scrollbar,
                  .testhub-plan-cases-table-scroll .ant-table-body::-webkit-scrollbar {
                    height: 4px;
                    background: transparent;
                  }
                  .testhub-plan-cases-table-scroll .ant-table-content::-webkit-scrollbar-thumb,
                  .testhub-plan-cases-table-scroll .ant-table-body::-webkit-scrollbar-thumb {
                    background-color: transparent;
                    border-radius: 2px;
                    transition: background-color 0.3s ease;
                  }
                  .testhub-plan-cases-table-scroll .ant-table-content::-webkit-scrollbar-track,
                  .testhub-plan-cases-table-scroll .ant-table-body::-webkit-scrollbar-track {
                    background: transparent;
                  }
                  .testhub-plan-cases-table-scroll .ant-table-content:hover::-webkit-scrollbar,
                  .testhub-plan-cases-table-scroll .ant-table-body:hover::-webkit-scrollbar {
                    height: 4px;
                  }
                  .testhub-plan-cases-table-scroll .ant-table-content:hover::-webkit-scrollbar-thumb,
                  .testhub-plan-cases-table-scroll .ant-table-body:hover::-webkit-scrollbar-thumb {
                    background-color: #dddde0;
                  }

                  .testhub-plan-cases-table-scroll .ant-table-content {
                    scrollbar-width: thin;
                    scrollbar-color: transparent transparent;
                  }
                  .testhub-plan-cases-table-scroll .ant-table-content:hover {
                    scrollbar-width: thin;
                    scrollbar-color: #dddde0 transparent;
                  }
                  .testhub-plan-cases-table-scroll .ant-table-body {
                    scrollbar-width: thin;
                    scrollbar-color: transparent transparent;
                  }
                  .testhub-plan-cases-table-scroll .ant-table-body:hover {
                    scrollbar-width: thin;
                    scrollbar-color: #dddde0 transparent;
                  }
                `,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <PlanCasesModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        workspaceSlug={String(workspaceSlug)}
        projectId={String(projectId || "")}
        repositoryId={String(repositoryId)}
        repositoryName={repositoryName || ""}
        planId={String(planId || "")}
        initialSelectedCaseIds={(cases || []).map((c) => c?.case?.id).filter((id): id is string => Boolean(id))}
        onClosed={() => {
          // 关闭后刷新列表，保留当前查询参数与筛选
          fetchPlanTree();
          fetchCases(currentPage, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
        }}
      />
      <PlanIterationModal
        isOpen={isIterationModalOpen}
        onClose={() => setIsIterationModalOpen(false)}
        workspaceSlug={String(workspaceSlug)}
        projectId={String(projectId)}
        planId={String(planId || "")}
        onClosed={() => {
          fetchPlanTree();
          fetchCases(currentPage, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
        }}
      />
      <PlanReleaseModal
        isOpen={isReleaseModalOpen}
        onClose={() => setIsReleaseModalOpen(false)}
        workspaceSlug={String(workspaceSlug)}
        projectId={String(projectId)}
        planId={String(planId || "")}
        onClosed={() => {
          fetchPlanTree();
          fetchCases(currentPage, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
        }}
      />
      <PlanCasesExportModal
        open={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        workspaceSlug={String(workspaceSlug)}
        planId={planId}
        repositoryId={selectedRepositoryId}
        moduleId={selectedModuleId}
        selectedCaseIds={selectedCaseIds}
      />
      <UpdateModal
        open={isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          setActiveCase(null);
          fetchCases(currentPage, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
        }}
        caseId={activeCase?.id}
        workspaceSlug={String(workspaceSlug)}
        projectId={String(projectId || "")}
      />
    </div>
  );
}
