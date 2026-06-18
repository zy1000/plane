"use client";
import React from "react";
import { Transition } from "@headlessui/react";
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { Row, Col, Card, Input, Tag, Spin, Button, Table, Tooltip, Radio, Select, Modal, Badge, Tree, Checkbox } from "antd";
import type { TreeProps } from "antd";
import { AppstoreOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, DownOutlined } from "@ant-design/icons";
import debounce from "lodash-es/debounce";
import { CaseService as CaseApiService } from "@/services/qa/case.service";
import { CaseService as ReviewApiService, type ReviewCaseListItem } from "@/services/qa/review.service";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { ChevronDownIcon } from "@plane/propel/icons";
import { Button as PlaneButton } from "@plane/propel/button";
import { getEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import * as LucideIcons from "lucide-react";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { RichTextEditor } from "../cases/util";
import { WorkItemDisplayModal } from "../cases/work-item-display-modal";
import { ReviewRecordsPanel } from "./review-records";
import { ReviewCaseFilterBar, useReviewCaseFilter } from "./review-case-filter";
import { CaseVersionCompareModal } from "../cases/update-modal/case-version-compare-modal";
import UpdateModal from "../cases/update-modal";
import { useTranslation } from "@plane/i18n";
import { qaCaseErrorContent, qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";

type ReviewCaseRow = ReviewCaseListItem;


export default function CaseReview() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reviewId = searchParams.get("review_id") ?? "";
  const initialCaseId = searchParams.get("case_id") ?? undefined;

  const [reviewName, setReviewName] = React.useState<string>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("selectedReviewName") || "";
    return "";
  });

  const caseService = React.useMemo(() => new CaseApiService(), []);
  const reviewService = React.useMemo(() => new ReviewApiService(), []);
  const {
    getUserDetails,
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
  const [expandedKeys, setExpandedKeys] = React.useState<string[] | undefined>(undefined);
  const [autoExpandParent, setAutoExpandParent] = React.useState<boolean>(true);
  const [selectedTreeKey, setSelectedTreeKey] = React.useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = React.useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = React.useState<string | null>(null);
  const [reviewTree, setReviewTree] = React.useState<any | null>(null);
  const skipNextUrlSyncedFetchRef = React.useRef(false);
  const listScrollRef = React.useRef<HTMLDivElement>(null);

  const [detailLoading, setDetailLoading] = React.useState<boolean>(false);
  const [caseDetail, setCaseDetail] = React.useState<any>(null);
  const [enumsData, setEnumsData] = React.useState<{
    case_test_type?: Record<string, string>;
    case_type?: Record<string, string>;
    case_priority?: Record<string, string>;
    case_state?: Record<string, string>;
    plan_case_result?: Record<string, string>;
  }>({});
  const [attachments, setAttachments] = React.useState<any[]>([]);
  const [activeTab, setActiveTab] = React.useState<
    "basic" | "requirement" | "work" | "defect" | "attachment" | "history"
  >("basic");
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
    useReviewCaseFilter(cases, currentUser?.id ? String(currentUser.id) : undefined);

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
    try {
      const data = await reviewService.getReviewEnums(String(workspaceSlug));
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
          fetchSuggestionCountForCase(firstCaseId);
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
      const enums = await getEnums(String(workspaceSlug));
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
    try {
      const data = await caseService.getReviewCaseTree(String(workspaceSlug), { review_id: String(reviewId) });
      setReviewTree(data || null);
      setExpandedKeys(data ? collectDefaultExpandedKeys(data) : undefined);
      setAutoExpandParent(true);
    } catch {
      setReviewTree(null);
      setExpandedKeys(undefined);
      setAutoExpandParent(true);
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
      try {
        const list = await caseService.getCaseAssetList(String(workspaceSlug), String(targetId));
        setAttachments(Array.isArray(list) ? list : []);
      } catch {
        setAttachments([]);
      }
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
    if (workspaceSlug) {
      try {
        fetchWorkspaceMembers(String(workspaceSlug));
      } catch (e: unknown) {
        qaCaseSetToastError(e, t, "获取成员信息失败");
      }
    }
  }, [workspaceSlug, reviewId]);

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

  // 选中用例变化时,将对应卡片滚动到列表可见区(自动切换模式下停在切换后的位置;
  // 已可见时 block:nearest 不会滚动,也不会影响外层页面)
  React.useEffect(() => {
    if (!selectedCaseId) return;
    const container = listScrollRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-case-id="${selectedCaseId}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [selectedCaseId, filteredCases]);

  React.useEffect(() => {
    const map: Record<string, string> = {
      requirement: "史诗,特性,用户故事",
      work: "任务",
      defect: "缺陷",
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

  type StepItem = { result: string; description: string };

  const StepsTable: React.FC<{ steps?: StepItem[] }> = ({ steps }) => {
    if (!Array.isArray(steps) || steps.length === 0) {
      return <span className="text-secondary">暂无内容</span>;
    }
    const headerStyle = { backgroundColor: "var(--bg-layer-1)", padding: 12, border: "1px solid var(--border-subtle)" } as const;
    const cellStyle = { padding: 12, border: "1px solid var(--border-subtle)" } as const;
    const columns = [
      {
        title: "序号",
        key: "index",
        width: 80,
        render: (_: any, __: StepItem, idx: number) => idx + 1,
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
      {
        title: "步骤描述",
        dataIndex: "description",
        key: "description",
        render: (text: any) => <span className="whitespace-pre-wrap break-words">{String(text || "")}</span>,
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
      {
        title: "预期结果",
        dataIndex: "result",
        key: "result",
        render: (text: any) => (
          <span className="whitespace-pre-wrap break-words text-secondary">{String(text || "")}</span>
        ),
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
    ];
    return (
      <div className="rounded border border-subtle">
        <div className="overflow-x-auto">
          <Table
            size="small"
            pagination={false}
            bordered={false}
            rowKey={(_: any, idx?: number) => String(idx ?? 0)}
            dataSource={steps}
            columns={columns as any}
          />
        </div>
      </div>
    );
  };

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
    if (!reviewTree) return [];
    return [buildTreeNodes(reviewTree)];
  }, [reviewTree]);

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
      skipNextUrlSyncedFetchRef.current = true;
      updateFilterQueryParams({ project_id: projectId ? String(projectId) : null });
      fetchCases(keyword, null, true, null);
      return;
    }

    if (kind === "repository" || kind === "repository_modules_all") {
      const repositoryId = node?.repositoryId ? String(node.repositoryId) : null;
      setSelectedRepositoryId(repositoryId);
      setSelectedModuleId(null);
      setSelectedCaseId(undefined);
      setCaseDetail(null);
      skipNextUrlSyncedFetchRef.current = true;
      updateFilterQueryParams({ repository_id: repositoryId });
      fetchCases(keyword, null, true, repositoryId);
      return;
    }

    if (kind === "module") {
      const moduleId = node?.moduleId ? String(node.moduleId) : null;
      const repositoryId = node?.repositoryId ? String(node.repositoryId) : null;
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
    const reviewers = Array.isArray(row?.assignees) ? row!.assignees.map((id) => String(id)) : [];
    const isReviewer = currentUser?.id ? reviewers.includes(String(currentUser.id)) : false;
    setIsCurrentUserReviewer(isReviewer);
  }, [cases, selectedCaseId, currentUser?.id]);

  React.useEffect(() => {
    setActiveTab("basic");
  }, [selectedCaseId]);

  React.useEffect(() => {
    if (!selectedCaseId) return;
    const row = cases.find((item) => String(item.case_id ?? item.id) === String(selectedCaseId || ""));
    const reviewers = Array.isArray(row?.assignees) ? row!.assignees.map((id) => String(id)) : [];
    const isReviewer = currentUser?.id ? reviewers.includes(String(currentUser.id)) : false;
    setReviewValue(isReviewer ? "通过" : "建议");
    setReason("");
  }, [selectedCaseId, cases, currentUser?.id]);

  // 选中某条用例:更新选中态、按评审人重置默认评审值、加载详情与建议数
  const selectCase = (caseId: string, assignees?: Array<string>) => {
    const reviewers = Array.isArray(assignees) ? assignees.map((id) => String(id)) : [];
    const isReviewer = currentUser?.id ? reviewers.includes(String(currentUser.id)) : false;
    setSelectedCaseId(caseId);
    setReviewValue(isReviewer ? "通过" : "建议");
    setReason("");
    fetchCaseDetail(caseId);
    fetchSuggestionCountForCase(caseId);
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
      selectCase(String(next.case_id ?? next.id), next.assignees);
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
              }
            `,
            }}
          />
          <div className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm pt-2 pl-2">
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
              className="pb-2 custom-tree-indent"
            />
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
              <div className="flex flex-col gap-3 flex-1 min-h-0">
                <div
                  ref={listScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto vertical-scrollbar scrollbar-sm flex flex-col gap-3 pr-5 pl-1 pt-4 pb-2"
                  style={{ scrollbarGutter: "stable" }}
                >
                  {filteredCases.length === 0 ? (
                    <div className="text-secondary py-12 text-center">
                      {isFiltering && cases.length > 0 ? "暂无匹配的筛选结果" : "暂无数据"}
                    </div>
                  ) : (
                    filteredCases.map((item) => {
                      const caseId = String(item.case_id ?? item.id);
                      const isActive = String(selectedCaseId || "") === caseId;
                      const color = reviewEnums?.CaseReviewThrough_Result?.[item.result]?.color || "default";
                      const suggestionCount = suggestionCounts[caseId] || 0;
                      const showBadge = suggestionCount > 0;
                      const reviewerStatuses = Array.isArray(item.reviewer_statuses) ? item.reviewer_statuses : [];
                      const reviewerCount = Number(
                        item.reviewer_count ?? (Array.isArray(item.assignees) ? item.assignees.length : reviewerStatuses.length)
                      );
                      const fallbackUnreviewed = reviewerStatuses
                        .filter((status) => !Boolean(status?.reviewed))
                        .map((status) => String(status?.assignee || ""))
                        .filter((id) => Boolean(id));
                      const unreviewedAssignees = (
                        Array.isArray(item.unreviewed_assignees) ? item.unreviewed_assignees : fallbackUnreviewed
                      )
                        .map((assigneeId) => String(assigneeId || ""))
                        .filter((id) => Boolean(id));
                      const reviewedCount = Number(
                        item.reviewed_count ?? Math.max(reviewerCount - unreviewedAssignees.length, 0)
                      );
                      const safeReviewedCount = Math.min(Math.max(reviewedCount, 0), Math.max(reviewerCount, 0));
                      const pendingCount =
                        reviewerCount > 0 ? Math.max(unreviewedAssignees.length, reviewerCount - safeReviewedCount) : 0;
                      const progressPercent = reviewerCount > 0 ? Math.round((safeReviewedCount / reviewerCount) * 100) : 0;
                      const pendingNames = unreviewedAssignees
                        .map((assigneeId) => getUserDetails(assigneeId)?.display_name || "未知用户")
                        .join("、");
                      const pendingTooltip = pendingCount > 0 ? `待评审：${pendingNames || "成员信息加载中"}` : "";
                      const pendingAvatarIds = unreviewedAssignees.slice(0, 5);
                      const extraPendingCount = Math.max(pendingCount - pendingAvatarIds.length, 0);
                      return (
                        <Card
                          key={item.id}
                          data-case-id={caseId}
                          bordered
                          hoverable
                          onClick={() => {
                            selectCase(caseId, item.assignees);
                          }}
                          className={`${isActive ? "ring-2 ring-accent-strong" : ""} rounded-md hover:shadow-sm transition-shadow relative !overflow-visible`}
                        >
                          {showBadge && (
                            <div className="absolute -top-2 -right-2 z-10">
                              <Badge count={suggestionCount} style={{ backgroundColor: "#ee313b" }} />
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium truncate">{item.name}</div>
                            <Tag color={color}>{item.result || "-"}</Tag>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-secondary">
                            {reviewerCount > 0 ? (
                              <span>{`已评 ${safeReviewedCount}/${reviewerCount}`}</span>
                            ) : (
                              <span>未配置评审人</span>
                            )}
                            {reviewerCount > 0 ? <span>{progressPercent}%</span> : null}
                          </div>
                          {reviewerCount > 0 ? (
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f5f5f5]">
                              <div
                                className="h-full bg-accent-primary transition-all duration-300 ease-out"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          ) : null}
                          {reviewerCount > 0 ? (
                            pendingCount > 0 ? (
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <Tooltip title={pendingTooltip}>
                                  <div className="truncate text-xs text-[#d48806]">{`待评审 ${pendingCount} 人`}</div>
                                </Tooltip>
                                <div className="flex items-center gap-1">
                                  {pendingAvatarIds.length > 0 ? (
                                    <Tooltip title={pendingTooltip}>
                                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <ButtonAvatars showTooltip={false} userIds={pendingAvatarIds} size="sm" />
                                      </div>
                                    </Tooltip>
                                  ) : null}
                                  {extraPendingCount > 0 ? (
                                    <span className="text-xs text-[#d48806]">{`+${extraPendingCount}`}</span>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-[#52c41a]">评审完成</div>
                            )
                          ) : null}
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
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
              <div className="flex h-full min-w-0 flex-col p-4" style={{ scrollPaddingBottom: 16 }}>
                {!selectedCaseId ? (
                  <div className="text-secondary py-12 text-center">请从左侧选择一个用例</div>
                ) : detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Spin />
                  </div>
                ) : !caseDetail ? (
                  <div className="text-secondary py-12 text-center">未获取到用例详情</div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col gap-4">
                    <div className="border-b border-subtle">
                      <nav className="flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab("basic")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm -mb-px border-b-2 transition-colors ${
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
                      onClick={() => setActiveTab("requirement")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm -mb-px border-b-2 transition-colors ${
                        activeTab === "requirement"
                          ? "text-accent-primary border-accent-strong"
                          : "text-primary border-transparent hover:text-accent-primary"
                      }`}
                    >
                      <LucideIcons.FileText size={16} aria-hidden="true" />
                      需求
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("work")}
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm -mb-px border-b-2 transition-colors ${
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
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm -mb-px border-b-2 transition-colors ${
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
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm -mb-px border-b-2 transition-colors ${
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
                      className={`flex items-center gap-1.5 px-2 py-3 text-sm -mb-px border-b-2 transition-colors ${
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
                    <div className="min-h-0 flex-1 overflow-hidden">
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
                          <div className="flex h-full flex-col gap-4 overflow-y-auto vertical-scrollbar scrollbar-sm pb-20">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="text-lg font-semibold min-w-0 break-words text-left hover:text-accent-primary cursor-pointer transition-colors"
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          <div className="col-span-1">
                            <div className="text-sm leading-5 font-medium text-secondary mb-1">维护人</div>
                            {caseDetail?.assignee ? (
                              <MemberDropdown
                                multiple={false}
                                value={caseDetail.assignee.id}
                                onChange={() => {}}
                                disabled={true}
                                placeholder={getUserDetails(caseDetail.assignee)?.display_name || "未知用户"}
                                className="w-full text-sm h-8"
                                buttonContainerClassName="w-full text-left p-0 cursor-default h-8 flex items-center"
                                buttonVariant="transparent-with-text"
                                buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit h-8"
                                showUserDetails={true}
                                optionsClassName="z-[60]"
                              />
                            ) : (
                              <div className="text-sm text-secondary h-8 flex items-center">未设置维护人</div>
                            )}
                          </div>
                          <div className="col-span-1">
                            <div className="text-sm leading-5 font-medium text-secondary mb-1">用例编号</div>
                            <div className="h-8 flex items-center text-sm">
                              {caseDetail?.sequence_id ? `${caseDetail?.project_identifier ? caseDetail.project_identifier + "-" : ""}${caseDetail.sequence_id}` : (caseDetail?.code ?? "-")}
                            </div>
                          </div>
                          <div className="col-span-1">
                            <div className="text-sm leading-5 font-medium text-secondary mb-1">类型</div>
                            <div className="h-8 flex items-center">
                              <Tag>{enumsData.case_type?.[String(caseDetail?.type)] ?? "-"}</Tag>
                            </div>
                          </div>
                          <div className="col-span-1">
                            <div className="text-sm leading-5 font-medium text-secondary mb-1">等级</div>
                            <div className="h-8 flex items-center">
                              <Tag>{enumsData.case_priority?.[String(caseDetail?.priority)] ?? "-"}</Tag>
                            </div>
                          </div>
                          <div className="col-span-1">
                            <div className="text-sm leading-5 font-medium text-secondary mb-1">标签</div>
                            <div className="flex flex-wrap items-center gap-1 min-h-[32px]">
                               {Array.isArray(caseDetail?.labels) && caseDetail.labels.length > 0 ? (
                                 caseDetail.labels.map((label: any) => (
                                   <div key={label?.id || label} className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs border border-blue-100">
                                     {label?.name || label}
                                   </div>
                                 ))
                               ) : (
                                 <span className="text-sm text-secondary">-</span>
                               )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
                            前置条件
                          </label>
                          <RichTextEditor
                            value={String(caseDetail?.precondition ?? "")}
                            onChange={() => {}}
                            onBlur={() => {}}
                            aria-label="前置条件"
                            placeholder="暂无内容"
                            editable={false}
                          />
                        </div>

                        <div>
                          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                            测试步骤
                          </label>
                          <StepsTable steps={caseDetail?.steps as StepItem[]} />
                        </div>

                        <div>
                          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                            备注
                          </label>
                          <RichTextEditor
                            value={caseDetail.remark}
                            onChange={() => {}}
                            onBlur={() => {}}
                            aria-label="备注"
                            placeholder="暂无内容"
                            editable={false}
                          />
                        </div>

                      </div>
                    )}
                  </Transition>

                  <Transition
                    show={activeTab === "requirement"}
                    enter="transition duration-150 ease-out"
                    enterFrom="transform scale-95 opacity-0"
                    enterTo="transform scale-100 opacity-100"
                    leave="transition duration-100 ease-in"
                    leaveFrom="transform scale-100 opacity-100"
                    leaveTo="transform scale-95 opacity-0"
                  >
                    {activeTab === "requirement" && selectedCaseId && (
                      <div className="-mt-6 h-full overflow-y-auto vertical-scrollbar scrollbar-sm pb-20">
                        <WorkItemDisplayModal caseId={String(selectedCaseId)} defaultType="Requirement" />
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
