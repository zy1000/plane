import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProjectQuickScope } from "@plane/types";
import { Checkbox, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { getViewTabClassName } from "@/components/views/in-page/view-tab-parts";
import { statusQuickScope } from "./match-quick-scope";
import type { TProjectQuickScopeCounts } from "./match-quick-scope";
import type { TProjectQuickStatus } from "./use-project-quick-filters";

const I18N = "workspace_projects.quick";

type TTab = { scope: TProjectQuickScope; label: string; count: number | undefined };

type Props = {
  scope: TProjectQuickScope;
  counts: TProjectQuickScopeCounts | undefined;
  mainStatuses: TProjectQuickStatus[];
  closedStatuses: TProjectQuickStatus[];
  myProjects: boolean;
  onScopeChange: (scope: TProjectQuickScope) => void;
  onMyProjectsChange: (value: boolean) => void;
};

const CountBadge = ({ count, active }: { count: number | undefined; active: boolean }) => {
  if (count === undefined) return null;
  return (
    <span
      className={cn(
        "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-11 font-medium tabular-nums",
        active ? "bg-surface-1 text-accent-primary" : "bg-layer-3 text-tertiary"
      )}
    >
      {count}
    </span>
  );
};

const Tab = ({ tab, active, onClick }: { tab: TTab; active: boolean; onClick: () => void }) => (
  <button type="button" className={getViewTabClassName(active)} aria-pressed={active} onClick={onClick}>
    {tab.label}
    <CountBadge count={tab.count} active={active} />
  </button>
);

const MenuItem = ({ tab, active, onClick }: { tab: TTab; active: boolean; onClick: () => void }) => (
  <CustomMenu.MenuItem onClick={onClick} className={cn("flex items-center gap-2", active && "bg-layer-transparent-active")}>
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded border",
        active ? "border-accent-strong bg-accent-primary text-on-color" : "border-strong"
      )}
    >
      {active && <Check className="size-3" strokeWidth={3} />}
    </span>
    <span className={cn("flex-1 truncate text-13", active ? "font-semibold text-primary" : "text-secondary")}>{tab.label}</span>
    {tab.count !== undefined && <span className="text-11 tabular-nums text-tertiary">{tab.count}</span>}
  </CustomMenu.MenuItem>
);

/**
 * 项目列表页头下方的快捷筛选条（照禅道项目列表）：
 * 全部 / 未完成 / 各非终态状态 / 已逾期 / 更多（终态、未设置状态、已归档） + 右侧「我参与的」。
 * 纯展示，状态与数量由 useProjectQuickFilters 给。
 */
export const ProjectQuickFilterBar = (props: Props) => {
  const { scope, counts, mainStatuses, closedStatuses, myProjects, onScopeChange, onMyProjectsChange } = props;
  const { t } = useTranslation();

  const mainTabs: TTab[] = [
    { scope: "all", label: t(`${I18N}.all`), count: counts?.all },
    { scope: "open", label: t(`${I18N}.open`), count: counts?.open },
    ...mainStatuses.map((status) => ({
      scope: statusQuickScope(status.id),
      label: status.label,
      count: counts ? (counts.byStatus[status.id] ?? 0) : undefined,
    })),
    { scope: "overdue", label: t(`${I18N}.overdue`), count: counts?.overdue },
  ];
  const moreTabs: TTab[] = [
    ...closedStatuses.map((status) => ({
      scope: statusQuickScope(status.id),
      label: status.label,
      count: counts ? (counts.byStatus[status.id] ?? 0) : undefined,
    })),
    { scope: "no_status", label: t(`${I18N}.no_status`), count: counts?.no_status },
    { scope: "archived", label: t(`${I18N}.archived`), count: counts?.archived },
  ];
  const activeMore = moreTabs.find((tab) => tab.scope === scope);

  let moreButton: ReactNode;
  if (activeMore) {
    moreButton = (
      <>
        {activeMore.label}
        <CountBadge count={activeMore.count} active />
        <ChevronDown className="size-3.5 shrink-0" />
      </>
    );
  } else {
    moreButton = (
      <>
        {t(`${I18N}.more`)}
        <ChevronDown className="size-3.5 shrink-0" />
      </>
    );
  }

  return (
    <div className="flex w-full shrink-0 items-center gap-0.5 border-b border-subtle px-4 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {mainTabs.map((tab) => (
          <Tab key={tab.scope} tab={tab} active={tab.scope === scope} onClick={() => onScopeChange(tab.scope)} />
        ))}
        <CustomMenu
          customButton={moreButton}
          customButtonClassName={getViewTabClassName(!!activeMore)}
          placement="bottom-start"
          optionsClassName="min-w-[180px]"
          closeOnSelect
        >
          {moreTabs.map((tab) => (
            <MenuItem key={tab.scope} tab={tab} active={tab.scope === scope} onClick={() => onScopeChange(tab.scope)} />
          ))}
        </CustomMenu>
      </div>
      <label className="flex shrink-0 cursor-pointer items-center gap-2 pl-3 text-13 text-secondary hover:text-primary">
        <Checkbox checked={myProjects} onChange={(e) => onMyProjectsChange(e.target.checked)} className="size-4" />
        {t(`${I18N}.my_projects`)}
      </label>
    </div>
  );
};
