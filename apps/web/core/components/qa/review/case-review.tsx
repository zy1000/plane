"use client";
import React from "react";
import useSWR from "swr";
import { Transition } from "@headlessui/react";
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { Row, Col, Input, Tag, Spin, Button, Table, Tooltip, Radio, Select, Modal, Checkbox } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, DownOutlined } from "@ant-design/icons";
import debounce from "lodash-es/debounce";
import { CaseService as CaseApiService } from "@/services/qa/case.service";
import { CaseService as ReviewApiService, type ReviewCaseListItem } from "@/services/qa/review.service";
import { Button as PlaneButton } from "@plane/propel/button";
import {
  ModuleTreePanel,
  buildRepositoryModuleNodes,
  findModuleTreeLabel,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
import { getEnums, globalEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import * as LucideIcons from "lucide-react";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
import {
  RichTextEditor,
  STEPS_TABLE_TH_STYLE,
  STEPS_TABLE_TD_STYLE,
  STEPS_TABLE_ANTD_CLASSNAME,
  StepsTableFrame,
} from "../cases/util";
import { CaseMetaForm } from "../cases/update-modal/case-meta-form";
import { WorkItemDisplayModal } from "../cases/work-item-display-modal";
import { workItemTypeName } from "../cases/work-item-category";
import { ReviewRecordsPanel } from "./review-records";
import { ReviewCaseFilterBar, useReviewCaseFilter } from "./review-case-filter";
import { ReviewCaseList } from "./review-case-list";
import {
  DEFAULT_REVIEW_CASE_ORDERING,
  isReviewCaseOrderBy,
  type TReviewCaseOrderBy,
} from "./review-case-display-filters";
import { CaseVersionCompareModal } from "../cases/update-modal/case-version-compare-modal";
import UpdateModal from "../cases/update-modal";
import { useTranslation } from "@plane/i18n";
import { qaCaseErrorContent, qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";
import { WORKSPACE_MEMBERS } from "@/constants/fetch-keys";

type ReviewCaseRow = ReviewCaseListItem;

// 评审枚举是静态字典，按工作区缓存一份，进页那一波不再和用例列表抢接口
const reviewEnumsCache = new Map<string, Record<string, Record<string, { label: string; color: string }>>>();

type StepItem = { result: string; description: string };

// 只读步骤表：表头/单元格样式与用例抽屉的 StepsEditor 共用同一套常量
const StepsTable: React.FC<{ steps?: StepItem[] }> = ({ steps }) => {
  if (!Array.isArray(steps) || steps.length === 0) {
    return <span className="text-secondary">暂无内容</span>;
  }
  const columns = [
    {
      title: "序号",
      key: "index",
      width: 48,
      render: (_: any, __: StepItem, idx: number) => <span>{idx + 1}</span>,
      onHeaderCell: () => ({ style: STEPS_TABLE_TH_STYLE }),
      onCell: () => ({ style: STEPS_TABLE_TD_STYLE }),
    },
    {
      title: "步骤描述",
      dataIndex: "description",
      key: "description",
      render: (text: any) => <span className="whitespace-pre-wrap break-words leading-5">{String(text || "")}</span>,
      onHeaderCell: () => ({ style: STEPS_TABLE_TH_STYLE }),
      onCell: () => ({ style: STEPS_TABLE_TD_STYLE }),
    },
    {
      title: "预期结果",
      dataIndex: "result",
      key: "result",
      render: (text: any) => <span className="whitespace-pre-wrap break-words leading-5">{String(text || "")}</span>,
      onHeaderCell: () => ({ style: STEPS_TABLE_TH_STYLE }),
      onCell: () => ({ style: STEPS_TABLE_TD_STYLE }),
    },
  ];
  return (
    <StepsTableFrame>
      <Table
        size="small"
        pagination={false}
        bordered={false}
        tableLayout="fixed"
        className={STEPS_TABLE_ANTD_CLASSNAME}
        rowKey={(_: any, idx?: number) => String(idx ?? 0)}
        dataSource={steps}
        columns={columns as any}
      />
    </StepsTableFrame>
  );
};

// 抽屉同款属性行需要的数据规范化：id/枚举值统一成字符串，与下拉 options 的 value 类型一致
const normalizeId = (v: any): string | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "object") {
    const id = v.id ?? v.value ?? v.uuid;
    return id ? String(id) : undefined;
  }
  return String(v);
};

export default function CaseReview() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reviewId = searchParams.get("review_id") ?? "";
  const initialCaseId = searchParams.get("case_id") ?? undefined;
  // 排序从评审详情页随 URL 带过来，没带就用详情页同一个默认值，保证两边顺序一致
  const orderingParam = searchParams.get("ordering");
  const ordering: TReviewCaseOrderBy = isReviewCaseOrderBy(orderingParam) ? orderingParam : DEFAULT_REVIEW_CASE_ORDERING;

  const [reviewName, setReviewName] = React.useState<string>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("selectedReviewName") || "";
    return "";
  });

  const caseService = React.useMemo(() => new CaseApiService(), []);
  const reviewService = React.useMemo(() => new ReviewApiService(), []);
  const {
    workspace: { fetchWorkspaceMembers },
  } = useMember();
  const { data: currentUser } = useUser();

  const [reviewEnums, setReviewEnums] = React.useState<
    Record<string, Record<string, { label: string; color: string }>>
  >({});
  const [listLoading, setListLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cases, setCases] = React.useState<ReviewCaseRow[]>([]);
  const [keyword, setKeyword] = React.useState<string>("");
  const [selectedCaseId, setSelectedCaseId] = React.useState<string | undefined>(initialCaseId ?? undefined);
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([]);
  const [treeLoading, setTreeLoading] = React.useState<boolean>(false);
  const [selectedTreeKey, setSelectedTreeKey] = React.useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = React.useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = React.useState<string | null>(null);
  const [reviewTree, setReviewTree] = React.useState<any | null>(null);
  const skipNextUrlSyncedFetchRef = React.useRef(false);

  const [detailLoading, setDetailLoading] = React.useState<boolean>(false);
  const [caseDetail, setCaseDetail] = React.useState<any>(null);
  const [enumsData, setEnumsData] = React.useState<{
    case_test_type?: Record<string, string>;
    case_type?: Record<string, string>;
    case_priority?: Record<string, string>;
    case_state?: Record<string, string>;
    plan_case_result?: Record<string, string>;
  }>({});
  const caseTypeOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_type || {}).map(([value, label]) => ({ value, label, title: String(label) })),
    [enumsData.case_type]
  );
  const casePriorityOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_priority || {}).map(([value, label]) => ({ value, label, title: String(label) })),
    [enumsData.case_priority]
  );
  const [attachments, setAttachments] = React.useState<any[]>([]);
  const [activeTab, setActiveTab] = React.useState<"basic" | "work" | "defect" | "attachment" | "history">(
    "basic"
  );
  const [currentCount, setCurrentCount] = React.useState<number>(0);
  const [reviewValue, setReviewValue] = React.useState<"通过" | "不通过" | "建议" | null>("通过");
  const [reason, setReason] = React.useState<string>("");
  const [reasonModalOpen, setReasonModalOpen] = React.useState<boolean>(false);
  const [submitLoading, setSubmitLoading] = React.useState<boolean>(false);
  const [recordsRefreshKey, setRecordsRefreshKey] = React.useState<number>(0);
  const [isCurrentUserReviewer, setIsCurrentUserReviewer] = React.useState<boolean>(false);
  const [suggestionCounts, setSuggestionCounts] = React.useState<Record<string, number>>({});
  const [autoNext, setAutoNext] = React.useState<boolean>(true);
  const [isCaseModalOpen, setIsCaseModalOpen] = React.useState<boolean>(false);
  const { activeKey: activeFilterKey, setActiveKey: setActiveFilterKey, filters, filteredCases, isFiltering } =
    useReviewCaseFilter(cases);

  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const topOffset = projectPreferences.navigationMode === "horizontal" ? 180 : 130;

  type TCaseVersionItem = { id: string; version: number; created_at?: string };
  const [caseVersions, setCaseVersions] = React.useState<TCaseVersionItem[]>([]);
  const [loadingCaseVersions, setLoadingCaseVersions] = React.useState(false);
  const [compareOpen, setCompareOpen] = React.useState(false);

  const latestVersion = React.useMemo(() => {
    return -1;
  }, [caseVersions]);

  const currentVersionLabel = React.useMemo(() => {
    if (!caseDetail?.version) return "最新";
    const truncated = Math.trunc(caseDetail.version * 10) / 10;
    return `V${truncated.toFixed(1)}`;
  }, [caseDetail?.version]);

  const fetchReviewEnums = async () => {
    if (!workspaceSlug) return;
    const cached = reviewEnumsCache.get(String(workspaceSlug));
    if (cached) {
      setReviewEnums(cached);
      return;
    }
    try {
      const data = await reviewService.getReviewEnums(String(workspaceSlug));
      reviewEnumsCache.set(String(workspaceSlug), data || {});
      setReviewEnums(data || {});
    } catch {}
  };

  const getSuggestionCountFromRecords = React.useCallback((records: any[]) => {
    return records.filter((item: any) => String(item?.result || "") === "建议" && !Boolean(item?.confirmed)).length;
  }, []);

  const fetchSuggestionCountForCase = React.useCallback(
    async (caseId: string) => {
      if (!workspaceSlug || !reviewId || !caseId) return;
      try {
        const data = await reviewService.getRecords(String(workspaceSlug), String(reviewId), String(caseId));
        const list = Array.isArray(data) ? (data as any[]) : [];
        const count = getSuggestionCountFromRecords(list);
        setSuggestionCounts((prev) => ({ ...prev, [String(caseId)]: count }));
      } catch {
        setSuggestionCounts((prev) => ({ ...prev, [String(caseId)]: 0 }));
      }
    },
    [workspaceSlug, reviewId, reviewService, getSuggestionCountFromRecords]
  );

  const fetchCases = async (
    kw?: string,
    moduleId: string | null = selectedModuleId,
    autoSelectFirst?: boolean,
    repositoryId: string | null = selectedRepositoryId,
    silent = false
  ) => {
    if (!workspaceSlug || !reviewId) return;
    try {
      if (!silent) setListLoading(true);
      setError(null);
      const input = (kw ?? keyword).trim();
      const effectiveProjectId = !repositoryId && !moduleId ? (projectId ? String(projectId) : null) : null;
      const res = await reviewService.getReviewCaseList(String(workspaceSlug), String(reviewId), {
        all: true,
        ordering,
        // 卡片只用得到 mine 和待评审头像，别把每行的评审人 id 全拉回来
        slim: true,
        ...(effectiveProjectId ? { project_id: effectiveProjectId } : {}),
        ...(repositoryId ? { repository_id: repositoryId } : {}),
        ...(moduleId ? { module_id: moduleId } : {}),
        ...(input ? { name__icontains: input } : {}),
      });
      const nextCases = Array.isArray(res?.data) ? (res.data as ReviewCaseRow[]) : [];
      setCases(nextCases);
      const counts: Record<string, number> = {};
      nextCases.forEach((row) => {
        counts[String(row.case_id ?? row.id)] = Number(row.suggestion_count || 0);
      });
      setSuggestionCounts(counts);
      if (autoSelectFirst) {
        const first = nextCases?.[0];
        const firstCaseId = first?.case_id ? String(first.case_id) : undefined;
        setSelectedCaseId(firstCaseId);
        setCaseDetail(null);
        if (firstCaseId) {
          fetchCaseDetail(firstCaseId);
        }
      }
    } catch (e: unknown) {
      const fallback = "获取评审用例列表失败";
      setError(qaCaseErrorContent(e, t, fallback));
      qaCaseSetToastError(e, t, fallback);
    } finally {
      if (!silent) setListLoading(false);
    }
  };

  const fetchEnums = async () => {
    if (!workspaceSlug) return;
    try {
      // testhub 布局进模块时已拉过一份枚举放在 globalEnums，有就直接用，别在进页那一波再抢一次接口
      const cached: any = globalEnums.Enums;
      const enums = Object.keys(cached?.case_type || {}).length > 0 ? cached : await getEnums(String(workspaceSlug));
      setEnumsData({
        case_test_type: enums.case_test_type || {},
        case_type: enums.case_type || {},
        case_priority: enums.case_priority || {},
        case_state: enums.case_state || {},
        plan_case_result: enums.plan_case_result || {},
      });
    } catch {}
  };

  const fetchReviewTree = async () => {
    if (!workspaceSlug || !reviewId) return;
    setTreeLoading(true);
    try {
      const data = await caseService.getReviewCaseTree(String(workspaceSlug), { review_id: String(reviewId) });
      setReviewTree(data || null);
    } catch {
      setReviewTree(null);
    } finally {
      setTreeLoading(false);
    }
  };

  const fetchCaseDetail = async (id?: string) => {
    const targetId = id ?? selectedCaseId;
    if (!workspaceSlug || !targetId) return;
    try {
      setDetailLoading(true);
      const data = await caseService.getCase(String(workspaceSlug), String(targetId));
      setCaseDetail(data);
      setLoadingCaseVersions(true);
      caseService
        .getCaseVersions(String(workspaceSlug), String(targetId))
        .then((list) => setCaseVersions(Array.isArray(list) ? list : []))
        .catch(() => setCaseVersions([]))
        .finally(() => setLoadingCaseVersions(false));
      caseService
        .getCaseAssetList(String(workspaceSlug), String(targetId))
        .then((list) => setAttachments(Array.isArray(list) ? list : []))
        .catch(() => setAttachments([]));
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "获取用例详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRecordsUpdated = () => {
    if (!selectedCaseId) return;
    fetchSuggestionCountForCase(String(selectedCaseId));
  };

  const handleOpenCase = () => {
    if (!selectedCaseId) {
      qaCaseSetToastWarning("缺少用例信息，无法打开");
      return;
    }
    setIsCaseModalOpen(true);
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
    fetchReviewEnums();
  }, [workspaceSlug]);

  React.useEffect(() => {
    if (!reviewId || !workspaceSlug || !projectId || reviewName) return;
    reviewService
      .getReviewList(String(workspaceSlug), { project_id: String(projectId) })
      .then((list) => {
        const found = list.find((r) => String(r.id) === String(reviewId));
        if (found?.name) setReviewName(found.name);
      })
      .catch(() => {});
  }, [reviewId, workspaceSlug, projectId]);

  React.useEffect(() => {
    fetchEnums();
    fetchReviewTree();
  }, [workspaceSlug, reviewId]);

  // 与外层 workspace-wrapper 共用同一个 SWR key,避免整份工作区成员被重复拉一次
  useSWR(
    workspaceSlug ? WORKSPACE_MEMBERS(String(workspaceSlug)) : null,
    workspaceSlug ? () => fetchWorkspaceMembers(String(workspaceSlug)) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  React.useEffect(() => {
    if (!workspaceSlug || !reviewId) return;
    const repositoryIdFromUrl = searchParams.get("repository_id");
    const moduleIdFromUrl = searchParams.get("module_id");

    if (moduleIdFromUrl) {
      const nextModuleId = String(moduleIdFromUrl);
      if (
        skipNextUrlSyncedFetchRef.current &&
        selectedModuleId === nextModuleId &&
        selectedRepositoryId === null &&
        selectedTreeKey === `module:${nextModuleId}`
      ) {
        skipNextUrlSyncedFetchRef.current = false;
        return;
      }
      setSelectedRepositoryId(null);
      setSelectedModuleId(nextModuleId);
      setSelectedTreeKey(`module:${nextModuleId}`);
      fetchCases(keyword, nextModuleId, false, null);
      return;
    }

    if (repositoryIdFromUrl) {
      const nextRepositoryId = String(repositoryIdFromUrl);
      const nextTreeKey = selectedTreeKey.startsWith(`repo:${nextRepositoryId}`) ? selectedTreeKey : `repo:${nextRepositoryId}`;
      if (
        skipNextUrlSyncedFetchRef.current &&
        selectedModuleId === null &&
        selectedRepositoryId === nextRepositoryId &&
        selectedTreeKey === nextTreeKey
      ) {
        skipNextUrlSyncedFetchRef.current = false;
        return;
      }
      setSelectedRepositoryId(nextRepositoryId);
      setSelectedModuleId(null);
      setSelectedTreeKey(nextTreeKey);
      fetchCases(keyword, null, false, nextRepositoryId);
      return;
    }

    if (
      skipNextUrlSyncedFetchRef.current &&
      selectedModuleId === null &&
      selectedRepositoryId === null &&
      selectedTreeKey === "root"
    ) {
      skipNextUrlSyncedFetchRef.current = false;
      return;
    }
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    setSelectedTreeKey("root");
    fetchCases(keyword, null, false, null);
  }, [workspaceSlug, reviewId, projectId, searchParams.toString()]);

  React.useEffect(() => {
    if (initialCaseId) fetchCaseDetail(initialCaseId);
  }, [initialCaseId]);

  React.useEffect(() => {
    setCompareOpen(false);
  }, [selectedCaseId]);

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

  const debouncedSearch = React.useMemo(
    () =>
      debounce((v: string) => {
        fetchCases(v);
      }, 300),
    [workspaceSlug, reviewId]
  );

  React.useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const handleRadioChange = (e: any) => {
    const val = String(e?.target?.value || "") as "通过" | "不通过" | "建议";
    if (val !== reviewValue) {
      setReason("");
    }
    setReviewValue(val);
    if (val === "不通过" || val === "建议") {
      setReasonModalOpen(true);
    }
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

  // 左栏节点：用例库 → 模块 → 子模块；「全部用例」是树的固定首行
  const moduleTreeNodes = React.useMemo<TModuleTreeNode[]>(
    () => buildRepositoryModuleNodes(reviewTree, getTreeNodeKey),
    [reviewTree]
  );
  // key → 节点种类 / 所属用例库 / 模块 id，选中时据此决定列表过滤参数
  const treeNodeMetaMap = React.useMemo(() => {
    const map = new Map<string, { kind: string; repositoryId: string | null; moduleId: string | null }>();
    const visit = (node: any) => {
      const kind = String(node?.kind || "");
      map.set(getTreeNodeKey(node), {
        kind,
        repositoryId: node?.repository_id ? String(node.repository_id) : null,
        moduleId: kind === "module" && node?.id ? String(node.id) : null,
      });
      (Array.isArray(node?.children) ? node.children : []).forEach(visit);
    };
    if (reviewTree) visit(reviewTree);
    return map;
  }, [reviewTree]);
  const treeRailLabel =
    selectedTreeKey === "root" ? "全部用例" : findModuleTreeLabel(moduleTreeNodes, selectedTreeKey) || "全部用例";

  // 树刷新后默认展开各用例库，模块层级保持收起
  React.useEffect(() => {
    setExpandedKeys(moduleTreeNodes.map((node) => node.key));
  }, [moduleTreeNodes]);

  const updateFilterQueryParams = React.useCallback(
    (next: { project_id?: string | null; repository_id?: string | null; module_id?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (reviewId) params.set("review_id", String(reviewId));
      params.delete("case_id");
      params.delete("project_id");
      params.delete("repository_id");
      params.delete("module_id");
      if (next.project_id) params.set("project_id", String(next.project_id));
      if (next.repository_id) params.set("repository_id", String(next.repository_id));
      if (next.module_id) params.set("module_id", String(next.module_id));
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, reviewId, router, searchParams]
  );

  const handleTreeSelect = (key: string) => {
    setSelectedTreeKey(key);
    const meta = treeNodeMetaMap.get(key);

    if (!meta || meta.kind === "root") {
      setSelectedRepositoryId(null);
      setSelectedModuleId(null);
      setSelectedCaseId(undefined);
      setCaseDetail(null);
      skipNextUrlSyncedFetchRef.current = true;
      updateFilterQueryParams({ project_id: projectId ? String(projectId) : null });
      fetchCases(keyword, null, true, null);
      return;
    }

    if (meta.kind === "repository" || meta.kind === "repository_modules_all") {
      const repositoryId = meta.repositoryId;
      setSelectedRepositoryId(repositoryId);
      setSelectedModuleId(null);
      setSelectedCaseId(undefined);
      setCaseDetail(null);
      skipNextUrlSyncedFetchRef.current = true;
      updateFilterQueryParams({ repository_id: repositoryId });
      fetchCases(keyword, null, true, repositoryId);
      return;
    }

    if (meta.kind === "module") {
      const moduleId = meta.moduleId;
      const repositoryId = meta.repositoryId;
      setSelectedRepositoryId(repositoryId);
      setSelectedModuleId(moduleId);
      setSelectedCaseId(undefined);
      setCaseDetail(null);
      skipNextUrlSyncedFetchRef.current = true;
      updateFilterQueryParams({ module_id: moduleId });
      fetchCases(keyword, moduleId, true, repositoryId);
    }
  };

  React.useEffect(() => {
    const row = cases.find((item) => String(item.case_id ?? item.id) === String(selectedCaseId || ""));
    setIsCurrentUserReviewer(Boolean(row?.mine));
  }, [cases, selectedCaseId]);

  React.useEffect(() => {
    setActiveTab("basic");
  }, [selectedCaseId]);

  React.useEffect(() => {
    if (!selectedCaseId) return;
    const row = cases.find((item) => String(item.case_id ?? item.id) === String(selectedCaseId || ""));
    setReviewValue(row?.mine ? "通过" : "建议");
    setReason("");
  }, [selectedCaseId, cases]);

  // 选中某条用例:更新选中态、按评审人重置默认评审值、加载详情与建议数
  // mine 由服务端按当前用户算好:非空即当前用户是这条用例的评审人
  const selectCase = (caseId: string, mine: ReviewCaseRow["mine"]) => {
    setSelectedCaseId(caseId);
    setReviewValue(mine ? "通过" : "建议");
    setReason("");
    fetchCaseDetail(caseId);
  };

  // 用 ref 持有最新值,供 debouncedSubmit 闭包内的自动切换逻辑读取,避免拿到旧 state
  const casesRef = React.useRef(filteredCases);
  const selectedCaseIdRef = React.useRef(selectedCaseId);
  const autoNextRef = React.useRef(autoNext);
  React.useEffect(() => {
    casesRef.current = filteredCases;
    selectedCaseIdRef.current = selectedCaseId;
    autoNextRef.current = autoNext;
  }, [filteredCases, selectedCaseId, autoNext]);

  // 评审完成后切换到下一条:列表顺移 / 已是最后一条则提示
  const goToNextCase = async () => {
    const list = casesRef.current;
    const curId = String(selectedCaseIdRef.current || "");
    const idx = list.findIndex((item) => String(item.case_id ?? item.id) === curId);
    if (idx >= 0 && idx < list.length - 1) {
      const next = list[idx + 1];
      selectCase(String(next.case_id ?? next.id), next.mine);
      return;
    }
    qaCaseSetToastWarning("已是最后一条用例");
  };
  const goToNextCaseRef = React.useRef(goToNextCase);
  goToNextCaseRef.current = goToNextCase;

  const buildPayload = () => {
    if (!workspaceSlug || !reviewId || !selectedCaseId || !reviewValue) return null;
    if (!isCurrentUserReviewer && reviewValue !== "建议") return null;
    const payload: any = {
      review_id: String(reviewId),
      case_id: String(selectedCaseId),
      result: ({ 通过: "通过", 不通过: "不通过", 建议: "建议" } as const)[reviewValue],
    };
    if (reason && reason.trim()) payload.reason = reason.trim();
    if (currentUser?.id) payload.assignee = String(currentUser.id);
    return payload;
  };

  const debouncedSubmit = React.useMemo(
    () =>
      debounce(async (payload: any) => {
        if (!payload) return;
        setSubmitLoading(true);
        try {
          await caseService.submitCaseReview(String(workspaceSlug), payload);
          qaCaseSetToastSuccess("评审提交成功");
          setReasonModalOpen(false);
          setReason("");
          if (autoNextRef.current) {
            // 先静默刷新当前列表(更新已评审用例的结果标签),再切换到下一条
            await fetchCases(keyword, selectedModuleId, false, selectedRepositoryId, true);
            await goToNextCaseRef.current();
          } else {
            fetchCases(keyword, selectedModuleId, false, selectedRepositoryId, true);
          }
          setRecordsRefreshKey((k) => k + 1);
        } catch (e: unknown) {
          qaCaseSetToastError(e, t, "提交评审失败");
        } finally {
          setSubmitLoading(false);
        }
      }, 500),
    [workspaceSlug, keyword, selectedModuleId, t]
  );

  React.useEffect(() => {
    return () => {
      debouncedSubmit.cancel();
    };
  }, [debouncedSubmit]);

  const handleSubmitReview = () => {
    const payload = buildPayload();
    if (!payload) {
      if (!isCurrentUserReviewer) {
        qaCaseSetToastWarning("您不是该评审的评审人员，仅可提交建议");
      } else {
        qaCaseSetToastWarning("请选择评审结果");
      }
      return;
    }
    if ((reviewValue === "不通过" || reviewValue === "建议") && !reason.trim()) {
      setReasonModalOpen(true);
      return;
    }
    debouncedSubmit(payload);
  };

  return (
    <div className="flex flex-col gap-3 p-4 w-full">
      <PageHead title="用例详情" />
      <Breadcrumbs>
        <Breadcrumbs.Item
          component={
            <BreadcrumbLink href={`/${workspaceSlug}/projects/${projectId}/testhub/reviews`} label="用例评审" />
          }
        />
        <Breadcrumbs.Item
          component={
            <BreadcrumbLink
              href={`/${workspaceSlug}/projects/${projectId}/testhub/caseManagementReviewDetail?review_id=${encodeURIComponent(String(reviewId))}`}
              label={reviewName || "用例评审详情"}
            />
          }
        />
        <Breadcrumbs.Item component={<BreadcrumbLink label="用例详情" isLast />} />
      </Breadcrumbs>

      <Row className="w-full rounded-md border border-subtle overflow-hidden" gutter={0} wrap={false}>
        {/* 左树与右边两栏等高：Row 没定高，面板自带的 h-full 算不出值反而不拉伸，用 h-auto 盖掉让它 stretch，再靠 max-h 钉在视口内 */}
        <ModuleTreePanel
          className={topOffset === 180 ? "h-auto max-h-[calc(100dvh-180px)]" : "h-auto max-h-[calc(100dvh-130px)]"}
          root={{ key: "root", label: "全部用例" }}
          nodes={moduleTreeNodes}
          selectedKey={selectedTreeKey}
          onSelect={handleTreeSelect}
          expandedKeys={expandedKeys}
          onExpandedKeysChange={setExpandedKeys}
          loading={treeLoading}
          emptyText="评审里还没有用例"
          railLabel={treeRailLabel}
        />

        <Col
          flex="0 0 auto"
          className="border-r border-subtle max-h-[calc(100dvh-130px)] overflow-hidden flex flex-col"
          style={{ width: 390, minWidth: 320, maxWidth: 520, maxHeight: `calc(100dvh - ${topOffset}px)` }}
        >
          <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
            <Input.Search
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
            <ReviewCaseFilterBar filters={filters} activeKey={activeFilterKey} onChange={setActiveFilterKey} />
            {listLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spin />
              </div>
            ) : error ? (
              <div className="bg-danger-subtle border border-danger-subtle rounded-md p-4 mb-2">
                <div className="text-danger-primary text-sm">{error}</div>
              </div>
            ) : (
              <ReviewCaseList
                cases={filteredCases}
                selectedCaseId={selectedCaseId}
                suggestionCounts={suggestionCounts}
                reviewEnums={reviewEnums}
                onSelect={selectCase}
                emptyText={isFiltering && cases.length > 0 ? "暂无匹配的筛选结果" : "暂无数据"}
              />
            )}
          </div>
        </Col>

        <Col
          flex="auto"
          className="flex flex-col min-h-0"
          style={{ height: `calc(100dvh - ${topOffset}px)`, maxHeight: `calc(100dvh - ${topOffset}px)` }}
        >
          <div className="flex flex-col flex-1 min-h-0">
            <div className="min-h-0 flex-1 overflow-hidden">
              {/* font-body：详情区在 antd Row 里，antd 会把字体族换成系统字体栈，这里拉回页面字体，与用例抽屉一致 */}
              <div className="flex h-full min-h-0 min-w-0 flex-col p-4 font-body" style={{ scrollPaddingBottom: 16 }}>
                {!selectedCaseId ? (
                  <div className="text-secondary py-12 text-center">请从左侧选择一个用例</div>
                ) : detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Spin />
                  </div>
                ) : !caseDetail ? (
                  <div className="text-secondary py-12 text-center">未获取到用例详情</div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-4">
                    <div className="border-b border-subtle">
                      <nav className="flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab("basic")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm leading-5 font-medium -mb-px border-b-2 transition-colors ${
                        activeTab === "basic"
                          ? "text-accent-primary border-accent-strong"
                          : "text-primary border-transparent hover:text-accent-primary"
                      }`}
                    >
                      <LucideIcons.Info size={16} aria-hidden="true" />
                      基本信息
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("work")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm leading-5 font-medium -mb-px border-b-2 transition-colors ${
                        activeTab === "work"
                          ? "text-accent-primary border-accent-strong"
                          : "text-primary border-transparent hover:text-accent-primary"
                      }`}
                    >
                      <LucideIcons.ListTodo size={16} aria-hidden="true" />
                      工作项
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("defect")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm leading-5 font-medium -mb-px border-b-2 transition-colors ${
                        activeTab === "defect"
                          ? "text-accent-primary border-accent-strong"
                          : "text-primary border-transparent hover:text-accent-primary"
                      }`}
                    >
                      <LucideIcons.Bug size={16} aria-hidden="true" />
                      缺陷
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("attachment")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm leading-5 font-medium -mb-px border-b-2 transition-colors ${
                        activeTab === "attachment"
                          ? "text-accent-primary border-accent-strong"
                          : "text-primary border-transparent hover:text-accent-primary"
                      }`}
                    >
                      <LucideIcons.Paperclip size={16} aria-hidden="true" />
                      附件
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("history")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm leading-5 font-medium -mb-px border-b-2 transition-colors ${
                        activeTab === "history"
                          ? "text-accent-primary border-accent-strong"
                          : "text-primary border-transparent hover:text-accent-primary"
                      }`}
                    >
                      <LucideIcons.History size={16} aria-hidden="true" />
                      评审历史
                    </button>
                      </nav>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
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
                          <div className="flex min-h-full flex-col gap-4 pb-20">
                        {/* 标题区排版对齐用例抽屉的 TitleInput：编号 11px 在上，标题 20px/600 在下；标题仍是按钮，点击打开抽屉 */}
                        <div>
                          <div className="mb-3">
                            <div className="mb-5 flex min-h-5 items-center">
                              <span className="text-caption-sm-regular font-medium whitespace-nowrap text-secondary">
                                {caseDetail?.sequence_id
                                  ? `${caseDetail?.project_identifier ? caseDetail.project_identifier + "-" : ""}${caseDetail.sequence_id}`
                                  : (caseDetail?.code ?? "-")}
                              </span>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="min-w-0 break-words py-1 text-left text-xl font-semibold text-primary transition-colors hover:text-accent-primary cursor-pointer"
                                onClick={handleOpenCase}
                                disabled={!selectedCaseId}
                              >
                                {caseDetail?.name ?? "-"}
                              </button>
                              <Tag className="m-0 shrink-0" color="blue">
                                {loadingCaseVersions ? "加载中..." : currentVersionLabel}
                              </Tag>
                              <Button
                                size="small"
                                type="link"
                                className="px-0 ml-4"
                                disabled={loadingCaseVersions || (caseVersions || []).length <= 0 || !selectedCaseId}
                                onClick={() => setCompareOpen(true)}
                              >
                                版本对比
                              </Button>
                            </div>
                          </div>
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
                            readonlyTextClassName="text-sm leading-6 text-primary"
                          />
                        </div>

                        <div>
                          <label className="mb-2 flex items-center gap-2 text-sm leading-5 font-medium text-secondary">
                            测试步骤
                          </label>
                          <StepsTable steps={caseDetail?.steps as StepItem[]} />
                        </div>

                        <div>
                          <label className="mb-2 flex items-center gap-2 text-sm leading-5 font-medium text-secondary">
                            备注
                          </label>
                          <RichTextEditor
                            value={caseDetail.remark}
                            onChange={() => {}}
                            onBlur={() => {}}
                            aria-label="备注"
                            placeholder="暂无内容"
                            editable={false}
                            readonlyTextClassName="text-sm leading-6 text-primary"
                          />
                        </div>

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
                      <div className="-mt-6 h-full overflow-y-auto vertical-scrollbar scrollbar-sm pb-20">
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
                      <div className="-mt-6 h-full overflow-y-auto vertical-scrollbar scrollbar-sm pb-20">
                        <WorkItemDisplayModal caseId={String(selectedCaseId)} defaultType="Bug" />
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
                          <div
                            id="attachments-section"
                            className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm scroll-mb-16 pb-20"
                          >
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
                          <ReviewRecordsPanel
                            key={`${selectedCaseId}-${recordsRefreshKey}`}
                            workspaceSlug={workspaceSlug}
                            reviewId={reviewId}
                            caseId={selectedCaseId}
                            onRecordsUpdated={handleRecordsUpdated}
                          />
                        )}
                      </Transition>
                    </div>
                    {selectedCaseId && (
                      <CaseVersionCompareModal
                        open={compareOpen}
                        onClose={() => setCompareOpen(false)}
                        workspaceSlug={String(workspaceSlug)}
                        caseId={String(selectedCaseId)}
                        caseVersions={caseVersions}
                        latestVersion={latestVersion}
                        currentVersionLabel={currentVersionLabel}
                        enumsData={enumsData as any}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedCaseId && !detailLoading && caseDetail && activeTab === "basic" ? (
              <div className="sticky bottom-0 w-full shrink-0 bg-surface-1" style={{ borderTop: "1px solid #f0f0f0" }}>
                <div className="p-4">
                  <div className="px-0 py-3 flex flex-col gap-3">
                    <div className="text-sm font-normal">开始评审</div>
                    <Radio.Group onChange={handleRadioChange} value={reviewValue} disabled={!selectedCaseId}>
                      <Radio value="通过" disabled={!isCurrentUserReviewer}>
                        <span style={{ color: "#52c41a" }} className="flex items-center gap-1">
                          <CheckCircleOutlined /> 通过
                        </span>
                      </Radio>
                      <Radio value="不通过" className="ml-6" disabled={!isCurrentUserReviewer}>
                        <span style={{ color: "#f5222d" }} className="flex items-center gap-1">
                          <CloseCircleOutlined /> 不通过
                        </span>
                      </Radio>
                      <Radio value="建议" className="ml-6">
                        <span style={{ color: "#fa8c16" }} className="flex items-center gap-1">
                          <ExclamationCircleOutlined /> 建议
                        </span>
                      </Radio>
                    </Radio.Group>
                    <div>
                      <Button type="link" onClick={() => setReasonModalOpen(true)} disabled={!selectedCaseId}>
                        添加原因
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSubmitReview}
                        disabled={!selectedCaseId || submitLoading}
                        className="text-on-color bg-accent-primary hover:bg-accent-primary-hover focus:text-on-color focus:bg-accent-primary-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitLoading ? "提交中..." : "提交评审"}
                      </button>
                      <Checkbox checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)}>
                        评审后自动切换下一条
                      </Checkbox>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Col>
      </Row>
      <Modal
        title="填写评审原因"
        open={reasonModalOpen}
        onCancel={() => setReasonModalOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <PlaneButton key="cancel" variant="secondary" onClick={() => setReasonModalOpen(false)}>
              取消
            </PlaneButton>
            <PlaneButton key="submit" variant="primary" loading={submitLoading} onClick={handleSubmitReview}>
              提交评审
            </PlaneButton>
          </div>
        }
      >
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="请输入不通过或建议的原因"
          allowClear
        />
      </Modal>
      <UpdateModal
        open={isCaseModalOpen}
        onClose={() => {
          setIsCaseModalOpen(false);
          fetchCases(keyword, selectedModuleId, false, selectedRepositoryId, true);
          if (selectedCaseId) fetchCaseDetail(String(selectedCaseId));
        }}
        caseId={selectedCaseId}
        workspaceSlug={workspaceSlug ? String(workspaceSlug) : undefined}
        projectId={projectId ? String(projectId) : undefined}
      />
    </div>
  );
}
