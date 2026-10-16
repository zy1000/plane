import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TDepartmentLoginFilter,
  TDepartmentPeopleQuery,
  TDepartmentPeopleResponse,
  TDepartmentTree,
} from "@plane/types";
import useDebounce from "@/hooks/use-debounce";
import { DepartmentService } from "@/services/department.service";
import { ExternalIntegrationService } from "@/services/external-integration.service";

const departmentService = new DepartmentService();
const externalIntegrationService = new ExternalIntegrationService();

export const DEPARTMENT_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 部门设置页的局部 state（同 use-external-integrations 的路线，不进 root store）。
 * 传 undefined 的 workspaceSlug 表示不请求（无权限时）。
 */
export const useDepartments = (workspaceSlug: string | undefined) => {
  const [tree, setTree] = useState<TDepartmentTree | null>(null);
  const [isTreeLoading, setIsTreeLoading] = useState(Boolean(workspaceSlug));
  const [treeError, setTreeError] = useState<unknown>(null);

  const [department, setDepartmentState] = useState<string | null>(null);
  const [includeChildren, setIncludeChildrenState] = useState(true);
  const [search, setSearchState] = useState("");
  const [leader, setLeaderState] = useState<string | null>(null);
  const [login, setLoginState] = useState<TDepartmentLoginFilter | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPageState] = useState<number>(DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  const [people, setPeople] = useState<TDepartmentPeopleResponse | null>(null);
  const [isPeopleLoading, setIsPeopleLoading] = useState(Boolean(workspaceSlug));
  const [isSyncing, setIsSyncing] = useState(false);
  // 只认最后一次请求：快速切部门时旧响应晚到不能覆盖
  const requestSeq = useRef(0);

  const fetchTree = useCallback(async () => {
    if (!workspaceSlug) return null;
    setIsTreeLoading(true);
    setTreeError(null);
    try {
      const response = await departmentService.fetchTree(workspaceSlug);
      setTree(response);
      return response;
    } catch (error) {
      setTreeError(error ?? true);
      return null;
    } finally {
      setIsTreeLoading(false);
    }
  }, [workspaceSlug]);

  const fetchPeople = useCallback(async () => {
    if (!workspaceSlug) return;
    const query: TDepartmentPeopleQuery = {
      department,
      include_children: includeChildren,
      search: debouncedSearch,
      leader,
      login,
      page,
      per_page: perPage,
    };
    const seq = ++requestSeq.current;
    setIsPeopleLoading(true);
    try {
      const response = await departmentService.fetchPeople(workspaceSlug, query);
      if (seq === requestSeq.current) setPeople(response);
    } catch {
      if (seq === requestSeq.current) setPeople(null);
    } finally {
      if (seq === requestSeq.current) setIsPeopleLoading(false);
    }
  }, [workspaceSlug, department, includeChildren, debouncedSearch, leader, login, page, perPage]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    void fetchPeople();
  }, [fetchPeople]);

  // 切部门：上级候选随部门变，旧的上级筛选清掉
  const selectDepartment = useCallback((next: string | null) => {
    setDepartmentState(next);
    setLeaderState(null);
    setPage(1);
  }, []);
  const setIncludeChildren = useCallback((value: boolean) => {
    setIncludeChildrenState(value);
    setLeaderState(null);
    setPage(1);
  }, []);
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);
  const setLeader = useCallback((value: string | null) => {
    setLeaderState(value);
    setPage(1);
  }, []);
  const setLogin = useCallback((value: TDepartmentLoginFilter | null) => {
    setLoginState(value);
    setPage(1);
  }, []);
  const setPerPage = useCallback((value: number) => {
    setPerPageState(value);
    setPage(1);
  }, []);

  /** 失败时抛后端错误体，调用方 toast；成功后树和当前列表都重拉 */
  const sync = useCallback(async () => {
    if (!workspaceSlug || !tree) return null;
    setIsSyncing(true);
    try {
      const response = await externalIntegrationService.sync(workspaceSlug, tree.sync.integration_key);
      await Promise.all([fetchTree(), fetchPeople()]);
      return response;
    } catch (error) {
      void fetchTree();
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [workspaceSlug, tree, fetchTree, fetchPeople]);

  return {
    tree,
    isTreeLoading,
    treeError,
    fetchTree,
    people,
    isPeopleLoading,
    filters: { department, includeChildren, search, leader, login, page, perPage },
    selectDepartment,
    setIncludeChildren,
    setSearch,
    setLeader,
    setLogin,
    setPage,
    setPerPage,
    isSyncing,
    sync,
  };
};

export type TDepartmentsState = ReturnType<typeof useDepartments>;
