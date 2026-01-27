"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, cloneElement, type ReactNode } from "react";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { Button } from "antd";
import PlanCasesModal from "@/components/qa/plans/plan-cases-modal";
import PlanIterationModal from "@/components/qa/plans/plan-iteration-modal";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { Row, Col, Tree, Table, Space, Tag, message, Dropdown, Pagination, Popconfirm, Select } from "antd";
import type { TableProps } from "antd";
import type { TreeProps } from "antd";
import { CaseService } from "@/services/qa/case.service";
import { PlanService } from "@/services/qa/plan.service";
import { AppstoreOutlined, DeploymentUnitOutlined, DownOutlined } from "@ant-design/icons";
import { FolderOpenDot } from "lucide-react";
import { formatDateTime, globalEnums } from "../util";
import { useUser } from "@/hooks/store/user";

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
};
type PlanCaseItem = {
  id: string;
  result?: string;
  case?: TestCase;
};
type PlanCaseResponse = { count: number; data: PlanCaseItem[] };

export default function PlanCasesPage() {
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
  const [pageSize, setPageSize] = useState<number>(10);
  const [ordering, setOrdering] = useState<string | undefined>(undefined);
  const [selectedResults, setSelectedResults] = useState<string[] | undefined>(undefined);

  const [activeCase, setActiveCase] = useState<TestCase | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isIterationModalOpen, setIsIterationModalOpen] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [selectedPlanCaseToCaseIdMap, setSelectedPlanCaseToCaseIdMap] = useState<Record<string, string>>({});
  const [bulkExecuteLoading, setBulkExecuteLoading] = useState<boolean>(false);

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
    } catch (e) {
      setError("用例加载失败");
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
          <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">
            {icon}
          </span>
          <span className={`text-sm text-custom-text-200 ${fontMedium ? "font-medium" : ""}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && <span className="text-xs text-custom-text-300">{count}</span>}
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
        <DeploymentUnitOutlined />
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
      await planService.cancelPlanCase(String(workspaceSlug), ids);
      if (Array.isArray(ids)) {
        setSelectedCaseIds([]);
        setSelectedPlanCaseToCaseIdMap({});
      }
      await fetchPlanTree();
      await fetchCases(
        1,
        pageSize,
        selectedRepositoryId || undefined,
        selectedModuleId || undefined
      );
      message.success("取消关联成功");
    } catch (e) {
      setError("取消关联失败");
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

  const onBulkExecuteSelected = async () => {
    if (!workspaceSlug || !planId) return;
    if (!currentUser?.id) {
      message.warning("缺少用户信息，无法提交执行结果");
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
      await fetchPlanTree();
      await fetchCases(currentPage, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "批量提交结果失败";
      message.error(msg);
    } finally {
      setBulkExecuteLoading(false);
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
            className="p-0 h-auto text-custom-text-200 hover:text-custom-text-100 hover:bg-transparent"
            onClick={() =>
              router.push(
                `/${workspaceSlug}/projects/${projectId}/testhub/test-execution?case_id=${encodeURIComponent(String(cid))}&plan_id=${encodeURIComponent(String(planId || ""))}`
              )
            }
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
            className="p-0 h-auto text-custom-text-200 hover:text-custom-text-100 hover:bg-transparent"
            onClick={() =>
              router.push(
                `/${workspaceSlug}/projects/${projectId}/testhub/test-execution?case_id=${encodeURIComponent(String(cid))}&plan_id=${encodeURIComponent(String(planId || ""))}`
              )
            }
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
          <span className="block truncate" title={record.case.repository_name}>
            {record.case.repository_name}
          </span>
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
          <span className="block truncate" title={record.case.module}>
            {record.case.module}
          </span>
        ) : (
          "-"
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
      render: (_: any, record: PlanCaseItem) => (
        <Space>
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
            执行
          </Button>
          <Button size="small" type="link" danger onClick={() => onCancelRelation([record.id])}>
            取关
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="h-full w-full">
      <PageHead title="计划用例" description={repositoryName || ""} />
      <div className="flex h-full w-full flex-col">
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div
            className="relative h-full min-h-0 border-r border-custom-border-200 overflow-y-auto flex-shrink-0"
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
                  width: 14px !important;
                  margin-inline-end: 2px !important;
                }
                .custom-tree-indent .ant-tree-node-content-wrapper {
                  padding-inline: 4px !important;
                }
              `,
              }}
            />
            <Tree
              showLine={false}
              defaultExpandAll
              onSelect={onSelect}
              onExpand={onExpand}
              expandedKeys={expandedKeys}
              autoExpandParent={autoExpandParent}
              treeData={treeData}
              selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
              className="py-2 pl-2 custom-tree-indent"
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
                            className="min-w-[200px] h-full cursor-pointer [&_.ant-select-selector]:!p-0 [&_.ant-select-selector]:!h-full [&_.ant-select-selector]:!min-h-full [&_.ant-select-selector]:!items-center [&_.ant-select-selector]:!cursor-pointer [&_.ant-select-selection-wrap]:!h-full [&_.ant-select-selection-wrap]:!items-center [&_.ant-select-selection-wrap]:!flex [&_.ant-select-selection-search]:!h-full [&_.ant-select-selection-search-input]:!h-full [&_.ant-select-selection-item]:!leading-4 [&_.ant-select-selection-item]:!text-sm [&_.ant-select-selection-item]:!text-custom-text-200 [&_.ant-select-selection-placeholder]:!leading-4 [&_.ant-select-selection-placeholder]:!text-sm [&_.ant-select-selection-placeholder]:!text-custom-text-300"
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
                <div>
                  <Dropdown.Button
                    type="primary"
                    icon={<DownOutlined />}
                    menu={{
                      items: dropdownItems,
                      onClick: ({ key }) => {
                        if (key === "by_work_item") {
                          setIsPlanModalOpen(true);
                        } else if (key === "by_iteration") {
                          setIsIterationModalOpen(true);
                        } else if (key === "by_release") {
                          message.info("通过发布规划暂未实现");
                        }
                      },
                    }}
                    onClick={() => setIsPlanModalOpen(true)}
                    disabled={!repositoryId}
                    buttonsRender={(buttons) => [
                      cloneElement(buttons[0] as any, {
                        className:
                          "text-white bg-custom-primary-100 hover:bg-custom-primary-200 focus:text-custom-brand-40 focus:bg-custom-primary-200 px-3 py-0.5 font-medium text-xs rounded-l flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed",
                      }),
                      cloneElement(buttons[1] as any, {
                        className:
                          "text-white bg-custom-primary-100 hover:bg-custom-primary-200 focus:text-custom-brand-40 focus:bg-custom-primary-200 px-2 py-0.5 font-medium text-xs rounded-r flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                      }),
                    ]}
                  >
                    规划用例
                  </Dropdown.Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden px-0 pb-3 min-w-0">
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-custom-text-300">加载中...</div>
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
                      className={`testhub-plan-cases-table-scroll flex-1 relative px-0 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--color-scrollbar))] [&::-webkit-scrollbar-thumb]:rounded-full ${
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
                          },
                        }}
                      />
                    </div>
                    <div className="flex-shrink-0 border-t border-custom-border-200 px-0 py-3 bg-custom-background-100 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm">
                        {selectedCaseIds.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-custom-text-300">已选择 {selectedCaseIds.length} 条</span>
                            <span
                              className="cursor-pointer text-sm transition-colors"
                              style={{ color: "#2a83ff" }}
                              onClick={() => {
                                setSelectedCaseIds([]);
                                setSelectedPlanCaseToCaseIdMap({});
                              }}
                            >
                              清除选择
                            </span>
                            <Popconfirm
                              title="确定将选中用例全部标记为执行成功？"
                              onConfirm={onBulkExecuteSelected}
                              okText="确定"
                              cancelText="取消"
                              okButtonProps={{ loading: bulkExecuteLoading }}
                            >
                              <span
                                className="cursor-pointer text-sm transition-colors"
                                style={{ color: "#2a83ff" }}
                              >
                                执行
                              </span>
                            </Popconfirm>
                            <Popconfirm
                              title="确定取关选中用例？"
                              onConfirm={() => onCancelRelation(selectedCaseIds)}
                              okText="确定"
                              cancelText="取消"
                            >
                              <span className="text-red-500 hover:text-red-600 cursor-pointer transition-colors">
                                取关
                              </span>
                            </Popconfirm>
                          </div>
                        )}
                        <span className="text-custom-text-300">
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
                    background: #f5f5f5;
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong{
                    overflow-y: scroll;
                    scrollbar-width: auto;
                    scrollbar-color: rgb(var(--color-scrollbar)) transparent;
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong::-webkit-scrollbar{
                    width: 12px;
                    height: 12px;
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong::-webkit-scrollbar-thumb{
                    background-color: rgba(var(--color-scrollbar), 0.85);
                    border-radius: 999px;
                    border: 3px solid rgba(var(--color-background-100), 1);
                  }

                  .testhub-plan-cases-table-scroll.testhub-plan-cases-scrollbar-strong::-webkit-scrollbar-track{
                    background: transparent;
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
    </div>
  );
}
