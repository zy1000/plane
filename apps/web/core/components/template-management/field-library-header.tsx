import { Link } from "react-router";
import { Button } from "@plane/propel/button";
import { useIssueFieldLibrary } from "@/hooks/store/use-issue-field-library";
import { useRequirementFieldLibrary } from "@/hooks/store/use-requirement-field-library";
import { getTemplateManagementTabPath } from "./navigation";
import { useTemplatePermissions } from "./permissions";

export type TFieldLibraryKey = "issue" | "requirement";
export type TFieldLibrarySwitchItem = {
  key: TFieldLibraryKey;
  label: string;
  href: string;
  /** 没拉回来（或拉失败）时为 undefined */
  count: number | undefined;
};

/**
 * 页头开关的各项。当前库的数量由页面自己的列表给（增删后跟着变）；另一个库只为显示数量拉一次。
 * 另一边没有菜单读权限时不拉、也不出那一项，页头就不显示开关。
 * 要在 observer 组件里调用（权限读的是 observable）。
 */
export const useFieldLibrarySwitch = (
  workspaceSlug: string,
  activeKey: TFieldLibraryKey,
  activeCount: number | undefined
): TFieldLibrarySwitchItem[] => {
  const { canViewDevModes, canViewRequirementTypes } = useTemplatePermissions(workspaceSlug);
  const showIssue = activeKey === "issue" || canViewDevModes;
  const showRequirement = activeKey === "requirement" || canViewRequirementTypes;
  const issueLibrary = useIssueFieldLibrary(activeKey !== "issue" && showIssue ? workspaceSlug : undefined);
  const requirementLibrary = useRequirementFieldLibrary(
    activeKey !== "requirement" && showRequirement ? workspaceSlug : undefined
  );
  const countOf = (key: TFieldLibraryKey, library: { fields: unknown[]; hasLoaded: boolean; error: string | null }) =>
    key === activeKey ? activeCount : library.hasLoaded && !library.error ? library.fields.length : undefined;

  const items: TFieldLibrarySwitchItem[] = [];
  if (showIssue)
    items.push({
      key: "issue",
      label: "工作项",
      href: getTemplateManagementTabPath(workspaceSlug, "issue-fields"),
      count: countOf("issue", issueLibrary),
    });
  if (showRequirement)
    items.push({
      key: "requirement",
      label: "需求",
      href: getTemplateManagementTabPath(workspaceSlug, "requirement-fields"),
      count: countOf("requirement", requirementLibrary),
    });
  return items;
};

type Props = {
  activeKey: TFieldLibraryKey;
  /** 可切换的库；只有一项（另一边没权限）时不出开关 */
  libraries: TFieldLibrarySwitchItem[];
  canManage: boolean;
  onCreate: () => void;
};

/**
 * 工作项 / 需求两个通用字段库共用的页头：标题 + 分段开关 + 新建。
 * 两个库的数据各自独立，开关只是在两个地址之间跳。
 */
export function FieldLibraryHeader({ activeKey, libraries, canManage, onCreate }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-5">
        <h1 className="text-24 leading-9 font-semibold text-primary">通用字段库</h1>
        {libraries.length > 1 && (
          <nav aria-label="字段库" className="inline-flex gap-0.5 rounded-lg bg-layer-1-hover p-[3px]">
            {libraries.map((library) => {
              const isActive = library.key === activeKey;
              return (
                <Link
                  key={library.key}
                  to={library.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex h-[30px] items-center gap-1.5 rounded-md px-4 text-14 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent-strong ${
                    isActive
                      ? "bg-surface-1 font-medium text-primary shadow-raised-100"
                      : "text-secondary hover:text-primary"
                  }`}
                >
                  {library.label}
                  <span className="text-12 font-normal text-tertiary tabular-nums">{library.count ?? "—"}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>
      {canManage && (
        <Button variant="primary" size="xl" className="h-9 shrink-0 px-4" onClick={onCreate}>
          新建字段
        </Button>
      )}
    </header>
  );
}
