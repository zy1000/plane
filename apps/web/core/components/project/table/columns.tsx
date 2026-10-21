import type { ReactNode } from "react";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { AlertCircle } from "lucide-react";
import { PROJECT_CLOSED_STATUS_LABELS, PROJECT_DISPLAY_PROPERTIES } from "@plane/constants";
import { Tooltip } from "@plane/propel/tooltip";
import type { IUserLite, TProject, TProjectDisplayProperties, TProjectDisplayPropertyKey } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getDate, getFileURL, renderFormattedPayloadDate } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import type { TProjectDictionaryField, TProjectListLookups } from "../filters/use-project-list-lookups";
import { resolveProjectStatusColor } from "../status-color";

const I18N = "workspace_projects";

/** 固定列：项目名称吃剩余宽度（下限见 NAME_COLUMN_MIN_WIDTH），操作列定宽 */
export const NAME_COLUMN_MIN_WIDTH = 280;
export const ACTIONS_COLUMN_WIDTH = 150;

export const PROJECT_COLUMN_WIDTH: Record<TProjectDisplayPropertyKey, number> = {
  code: 168,
  project_type: 116,
  business_category: 116,
  status: 112,
  business_unit: 112,
  dev_mode: 112,
  lead: 140,
  product_manager: 140,
  start_date: 112,
  end_date: 132,
  duration: 80,
  created_at: 112,
  members_count: 80,
};

export type TProjectTableContext = {
  lookups: TProjectListLookups;
  getUserDetails: (userId: string) => IUserLite | undefined;
  /** 今天，`YYYY-MM-DD`，判断逾期用 */
  today: string;
  t: (key: string, params?: Record<string, string | number>) => string;
};

/** 按「显示」里勾选的顺序列出要渲染的列（顺序即 PROJECT_DISPLAY_PROPERTIES 的顺序） */
export const getVisibleProjectColumns = (displayProperties: TProjectDisplayProperties) =>
  PROJECT_DISPLAY_PROPERTIES.filter((column) => displayProperties[column.key]);

const EmptyCell = () => <span className="text-placeholder">—</span>;

const UserCell = ({ user, muted }: { user: IUserLite | undefined; muted: boolean }) => {
  if (!user) return <EmptyCell />;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar name={user.display_name} src={getFileURL(user.avatar_url)} showTooltip={false} />
      <span className={cn("truncate text-xs", muted ? "text-placeholder" : "text-primary")}>
        {user.display_name ?? user.email}
      </span>
    </div>
  );
};

const DictionaryCell = ({
  project,
  field,
  ctx,
}: {
  project: TProject;
  field: TProjectDictionaryField;
  ctx: TProjectTableContext;
}) => {
  const resolved = ctx.lookups.resolveItem(field, project[field], project[`${field}_detail`]);
  if (!resolved) return <EmptyCell />;
  // 状态永远是彩色标签；类型 / BU / 业务分类跟字典的「彩色显示」开关走
  const color =
    field === "status"
      ? resolveProjectStatusColor(resolved.item, resolved.dictionary)
      : resolveDictionaryItemColor(resolved.item, resolved.dictionary);
  return <DictionaryValueTag label={resolved.item.label} color={color} className="text-xs" />;
};

const DevModeCell = ({ project }: { project: TProject }) => {
  const devMode = project.dev_mode_detail;
  if (!devMode) return <EmptyCell />;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TypeIcon iconProps={devMode.icon_props?.icon} className="size-5 shrink-0 rounded" iconClassName="size-3" />
      <span className="truncate text-xs text-secondary">{devMode.name}</span>
    </div>
  );
};

const DateCell = ({ value }: { value: string | Date | null | undefined }) => {
  const formatted = value ? renderFormattedPayloadDate(value) : undefined;
  if (!formatted) return <EmptyCell />;
  return <span className="whitespace-nowrap tabular-nums text-xs text-secondary">{formatted}</span>;
};

/** 完成日期早于今天、项目未归档、状态也不是已完成 / 已取消 → 逾期 */
export const isProjectOverdue = (project: TProject, ctx: TProjectTableContext) => {
  if (!project.end_date || project.archived_at) return false;
  if (project.end_date.slice(0, 10) >= ctx.today) return false;
  const status = ctx.lookups.resolveItem("status", project.status, project.status_detail);
  return !PROJECT_CLOSED_STATUS_LABELS.includes(status?.item.label ?? "");
};

const EndDateCell = ({ project, ctx }: { project: TProject; ctx: TProjectTableContext }) => {
  if (!project.end_date) return <EmptyCell />;
  if (!isProjectOverdue(project, ctx)) return <DateCell value={project.end_date} />;
  return (
    <Tooltip tooltipContent={ctx.t(`${I18N}.filters.overdue_hint`)} position="top">
      <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums text-xs font-medium text-danger-primary">
        <AlertCircle className="size-3 shrink-0" />
        {renderFormattedPayloadDate(project.end_date)}
      </span>
    </Tooltip>
  );
};

const DurationCell = ({ project, ctx }: { project: TProject; ctx: TProjectTableContext }) => {
  const start = getDate(project.start_date);
  const end = getDate(project.end_date);
  if (!start || !end) return <EmptyCell />;
  const days = differenceInCalendarDays(end, start) + 1;
  if (days <= 0) return <EmptyCell />;
  return <span className="tabular-nums text-xs text-secondary">{ctx.t(`${I18N}.fields.duration_days`, { count: days })}</span>;
};

const TextCell = ({ value }: { value: string | null | undefined }) =>
  value ? <span className="block truncate text-xs text-secondary">{value}</span> : <EmptyCell />;

export const renderProjectCell = (
  column: TProjectDisplayPropertyKey,
  project: TProject,
  ctx: TProjectTableContext
): ReactNode => {
  const isArchived = !!project.archived_at;
  switch (column) {
    case "code":
      return <TextCell value={project.code} />;
    case "project_type":
      return <DictionaryCell project={project} field="project_type" ctx={ctx} />;
    case "business_category":
      return <DictionaryCell project={project} field="business_category" ctx={ctx} />;
    case "status":
      return <DictionaryCell project={project} field="status" ctx={ctx} />;
    case "business_unit":
      return <DictionaryCell project={project} field="business_unit" ctx={ctx} />;
    case "dev_mode":
      return <DevModeCell project={project} />;
    case "lead": {
      const lead =
        typeof project.project_lead === "string"
          ? ctx.getUserDetails(project.project_lead)
          : (project.project_lead ?? undefined);
      return <UserCell user={lead} muted={isArchived} />;
    }
    case "product_manager": {
      const manager = project.product_manager
        ? (ctx.getUserDetails(project.product_manager) ?? project.product_manager_detail ?? undefined)
        : undefined;
      return <UserCell user={manager} muted={isArchived} />;
    }
    case "start_date":
      return <DateCell value={project.start_date} />;
    case "end_date":
      return <EndDateCell project={project} ctx={ctx} />;
    case "duration":
      return <DurationCell project={project} ctx={ctx} />;
    case "created_at":
      return <DateCell value={project.created_at} />;
    case "members_count":
      // 成员名单只有 details 接口才带，lite 先到时显示占位
      return project.members ? (
        <span className="tabular-nums text-xs text-secondary">{project.members.length}</span>
      ) : (
        <EmptyCell />
      );
    default:
      return null;
  }
};
