import { Blend } from "lucide-react";
import useSWR from "swr";
import { WORKSPACE_DEV_MODE_MANAGE_PERMISSION_KEY } from "@plane/constants";
import type { IProjectView } from "@plane/types";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { IssueSchemeService } from "@/services/project/issue-scheme.service";

const issueSchemeService = new IssueSchemeService();

/** 研发模式视图：挂在模式方案上，跟随该模式的项目共用 */
export const isModeView = (view: IProjectView | null | undefined) => !!view?.issue_scheme;

/** 迭代 / 模块 / 发布 / 标签是各项目自己的数据，带这些条件的视图不能存到研发模式（与后端 scheme_views 一致） */
const PROJECT_LOCAL_FILTER_FIELDS: Record<string, string> = {
  cycle_id: "迭代",
  module_id: "模块",
  release_id: "发布",
  label_id: "标签",
};

const collectFilterKeys = (expression: unknown, keys: string[]) => {
  if (!expression || typeof expression !== "object") return;
  Object.entries(expression as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((child) => collectFilterKeys(child, keys));
    else if (value && typeof value === "object") collectFilterKeys(value, keys);
    else keys.push(key);
  });
};

/** 条件里用到的项目自有属性名（去重，按出现顺序） */
export const getProjectLocalFilterLabels = (richFilters: unknown): string[] => {
  const keys: string[] = [];
  collectFilterKeys(richFilters, keys);
  const labels = keys
    .map((key) => PROJECT_LOCAL_FILTER_FIELDS[key.split("__")[0]])
    .filter((label): label is string => !!label);
  return Array.from(new Set(labels));
};

/** 页签名后面的小方块：表示这个视图来自研发模式 */
export const ModeViewBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "grid size-4 shrink-0 place-items-center rounded-sm bg-warning-subtle text-warning-primary",
      className
    )}
    aria-label="研发模式视图"
  >
    <Blend className="size-2.5" strokeWidth={2.4} />
  </span>
);

export type TModeViewContext = {
  /** 项目跟随研发模式（共用模式方案） */
  isFollowing: boolean;
  modeName: string;
  schemeId: string | null;
  /** 有研发模式编辑权限：能存到研发模式、能更新研发模式视图 */
  canManage: boolean;
  /** 跟随该模式的项目数；没权限或还没拉回来时 undefined */
  followingCount: number | undefined;
};

/**
 * 页内视图页签里和研发模式有关的信息。跟随项目数只在有研发模式编辑权限时拉
 * （方案详情接口要研发模式权限），给「存到研发模式」和「更新到研发模式」写影响范围。
 */
export const useModeViewContext = (workspaceSlug: string, projectId: string): TModeViewContext => {
  const { getProjectById } = useProject();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const project = getProjectById(projectId);
  const isFollowing = project?.issue_scheme_detail?.is_project_owned === false;
  const schemeId = isFollowing ? (project?.issue_scheme ?? null) : null;
  const canManage = allowWorkspacePermissionKeys([WORKSPACE_DEV_MODE_MANAGE_PERMISSION_KEY], workspaceSlug);

  const { data: scheme } = useSWR(
    workspaceSlug && schemeId && canManage ? `ISSUE_SCHEME_DETAIL_${workspaceSlug}_${schemeId}` : null,
    () => issueSchemeService.getIssueScheme(workspaceSlug, schemeId as string),
    { revalidateOnFocus: false }
  );

  return {
    isFollowing,
    modeName: project?.dev_mode_detail?.name ?? "研发模式",
    schemeId,
    canManage,
    followingCount: scheme?.following_project_count,
  };
};
