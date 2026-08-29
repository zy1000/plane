import useSWR from "swr";
import type { TWorkspaceInvitableUser } from "@plane/types";
import useDebounce from "@/hooks/use-debounce";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

const SEARCH_DEBOUNCE_MS = 300;

export type TUseWorkspaceInvitableUsers = {
  users: TWorkspaceInvitableUser[];
  isLoading: boolean;
};

/** 本地 User 表中尚未加入该工作区的用户，按关键词防抖搜索（供邀请弹窗下拉选择） */
export function useWorkspaceInvitableUsers(workspaceSlug: string, search: string): TUseWorkspaceInvitableUsers {
  const trimmedSearch = search.trim();
  const debouncedSearch = useDebounce(trimmedSearch, SEARCH_DEBOUNCE_MS);
  const isDebouncing = trimmedSearch !== debouncedSearch;

  const swrKey = workspaceSlug ? `WORKSPACE_INVITABLE_USERS_${workspaceSlug}_${debouncedSearch}` : null;
  const { data, isLoading } = useSWR(
    swrKey,
    () => workspaceService.fetchInvitableUsers(workspaceSlug, { search: debouncedSearch }),
    { revalidateOnFocus: false }
  );

  return {
    users: data ?? [],
    // 防抖窗口内也视为加载中，避免用旧关键词的结果响应 Enter 选中
    isLoading: Boolean(swrKey && (isLoading || isDebouncing)),
  };
}
