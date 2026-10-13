import { observer } from "mobx-react";
import { Bug, Clock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TRisk } from "@plane/types";
import { ERiskStatus } from "@plane/types";
import { Avatar, CustomMenu } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { PLAIN_TD } from "@/components/review-tailorings/plain-table";
import { RiskLevelBadge, RiskStatusBadge } from "./badges";
import { RISK_I18N, riskCategoryLabelKey } from "./constants";

const EMPTY = <span className="text-placeholder">—</span>;

/** 计划处理日期早于今天且还没收口（草稿 / 待评估 / 持续跟踪）才算逾期 */
const OPEN_STATUSES = new Set<ERiskStatus>([
  ERiskStatus.DRAFT,
  ERiskStatus.PENDING_ASSESSMENT,
  ERiskStatus.TRACKING,
]);

export const isRiskOverdue = (risk: TRisk, today: string) =>
  Boolean(risk.planned_handle_date && risk.planned_handle_date < today && OPEN_STATUSES.has(risk.status));

/** 20px 头像 + 名字；没人是「未指定」占位 */
const PersonCell = ({ user, placeholder }: { user: IUserLite | null; placeholder: string }) => {
  if (!user) return <span className="truncate text-13 text-placeholder">{placeholder}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2" title={user.display_name}>
      <Avatar size="md" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate text-13 text-primary">{user.display_name}</span>
    </span>
  );
};

/**
 * 列表的一行：点整行开详情抽屉，行尾 ⋯ 菜单悬停才出（编辑 / 删除，只读角色没有）。
 */
export const RiskRow = observer(function RiskRow({
  risk,
  today,
  canEdit,
  isActive,
  onOpen,
  onEdit,
  onDelete,
}: {
  risk: TRisk;
  /** `yyyy-MM-dd`，逾期判断用；列表算一次传下来 */
  today: string;
  canEdit: boolean;
  isActive: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const overdue = isRiskOverdue(risk, today);
  const unassigned = t(`${RISK_I18N}.table.unassigned`);

  return (
    <tr className={cn("group cursor-pointer hover:bg-layer-1", isActive && "bg-layer-1")} onClick={onOpen}>
      <td className={cn(PLAIN_TD, "pl-6 whitespace-nowrap")}>
        <span className="font-mono text-12 text-secondary">{risk.code}</span>
      </td>
      <td className={cn(PLAIN_TD, "max-w-0")}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-primary" title={risk.name}>
            {risk.name}
          </span>
          {risk.issue_count > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-12 text-tertiary tabular-nums"
              title={t(`${RISK_I18N}.table.issue_count`, { count: risk.issue_count })}
            >
              <Bug className="size-3.5" aria-hidden="true" />
              {risk.issue_count}
            </span>
          )}
        </span>
      </td>
      <td className={PLAIN_TD}>
        <RiskStatusBadge status={risk.status} />
      </td>
      <td className={cn(PLAIN_TD, "whitespace-nowrap")}>
        {risk.category ? t(riskCategoryLabelKey(risk.category)) : EMPTY}
      </td>
      <td className={PLAIN_TD}>
        <RiskLevelBadge level={risk.risk_level} />
      </td>
      <td className={cn(PLAIN_TD, "max-w-0")}>
        <PersonCell user={risk.owner_detail} placeholder={unassigned} />
      </td>
      <td className={cn(PLAIN_TD, "max-w-0")}>
        <PersonCell user={risk.proposer_detail} placeholder={unassigned} />
      </td>
      <td className={cn(PLAIN_TD, "whitespace-nowrap text-secondary tabular-nums")}>{risk.proposed_date.slice(0, 10)}</td>
      <td className={cn(PLAIN_TD, "whitespace-nowrap tabular-nums")}>
        {risk.planned_handle_date ? (
          <span className={cn("inline-flex items-center gap-1", overdue ? "text-danger-primary" : "text-secondary")}>
            {overdue && <Clock className="size-3.5 shrink-0" aria-hidden="true" />}
            {risk.planned_handle_date.slice(0, 10)}
          </span>
        ) : (
          EMPTY
        )}
      </td>
      <td className={cn(PLAIN_TD, "pr-3 text-right")} onClick={(event) => event.stopPropagation()}>
        {canEdit && (
          <span className="inline-flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <CustomMenu
              ellipsis
              placement="bottom-end"
              closeOnSelect
              buttonClassName="text-tertiary hover:text-primary"
              ariaLabel={t(`${RISK_I18N}.detail.more`)}
            >
              <CustomMenu.MenuItem onClick={onEdit}>{t(`${RISK_I18N}.table.edit`)}</CustomMenu.MenuItem>
              <CustomMenu.MenuItem onClick={onDelete} className="text-danger-primary">
                {t(`${RISK_I18N}.table.delete`)}
              </CustomMenu.MenuItem>
            </CustomMenu>
          </span>
        )}
      </td>
    </tr>
  );
});
