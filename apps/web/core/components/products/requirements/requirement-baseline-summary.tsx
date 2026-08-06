import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TRequirementBaseline } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { approvalRuleLabel, PILL_BASE, REQUIREMENT_STATUS_PILL } from "./change/styles";

const MAX_VISIBLE_APPROVERS = 4;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-subtle px-3.5 py-2 first:border-t-0">
      <dt className="shrink-0 text-12 text-tertiary">{label}</dt>
      <dd className="m-0 min-w-0 truncate text-12 text-primary">{children}</dd>
    </div>
  );
}

function MemberChip({ member }: { member: IUserLite }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <Avatar size="sm" name={member.display_name} src={getFileURL(member.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate">{member.display_name}</span>
    </span>
  );
}

/**
 * 基线摘要浮层：页头那个状态 pill 点开后的内容。
 *
 * 存在的理由是「主语」—— pill 挂在 <h1>需求</h1> 旁边，光看一个「已发布」会被读成
 * 「『需求』这个模块已发布」。浮层标题写明「需求基线」，状态才有归属。
 *
 * 顺带把散在基线 Tab 里的几个属性（负责人、审批规则、审批人）汇到一处：它们不值得
 * 常驻占一条横向带，但需要的时候不该逼人切 Tab。
 */
export function RequirementBaselineSummary({
  baseline,
  onViewDetail,
}: {
  baseline: TRequirementBaseline;
  onViewDetail: () => void;
}) {
  const { t } = useTranslation();
  const { status, current_version: currentVersion, owner_detail: owner, approver_details: approvers } = baseline;
  const visibleApprovers = approvers.slice(0, MAX_VISIBLE_APPROVERS);
  const overflowCount = approvers.length - visibleApprovers.length;

  return (
    <div className="w-[268px]">
      <header className="border-b border-subtle px-3.5 py-2.5">
        <h2 className="text-13 font-semibold text-primary">
          {t("workspace_products.requirements.baseline.summary_title")}
        </h2>
      </header>

      <dl className="m-0">
        <Row label={t("workspace_products.requirements.baseline.status")}>
          <span className={cn(PILL_BASE, REQUIREMENT_STATUS_PILL[status], "text-11")}>
            {t(`workspace_products.requirements.status.${status}`)}
          </span>
        </Row>
        <Row label={t("workspace_products.requirements.baseline.version")}>
          {currentVersion === null ? (
            <span className="text-tertiary">
              {t("workspace_products.requirements.configuration.not_published")}
            </span>
          ) : (
            <span className="tabular-nums">
              {t("workspace_products.requirements.configuration.current_version", { version: currentVersion })}
            </span>
          )}
        </Row>
        <Row label={t("workspace_products.requirements.baseline.owner")}>
          <MemberChip member={owner} />
        </Row>
        <Row label={t("workspace_products.requirements.baseline.rule")}>
          {approvalRuleLabel(t, baseline.approval_type, baseline.required_count)}
        </Row>
        <Row label={t("workspace_products.requirements.baseline.approvers")}>
          {approvers.length === 0 ? (
            <span className="text-tertiary">
              {t("workspace_products.requirements.baseline.no_approvers")}
            </span>
          ) : (
            <span className="flex min-w-0 items-center justify-end gap-2">
              {visibleApprovers.map((approver) => (
                <Avatar
                  key={approver.id}
                  size="sm"
                  name={approver.display_name}
                  src={getFileURL(approver.avatar_url ?? "")}
                />
              ))}
              {overflowCount > 0 && <span className="shrink-0 text-tertiary">+{overflowCount}</span>}
            </span>
          )}
        </Row>
      </dl>

      <button
        type="button"
        onClick={onViewDetail}
        className="flex w-full items-center justify-between gap-2 border-t border-subtle bg-surface-2 px-3.5 py-2.5 text-12 font-medium text-accent-primary transition-colors duration-150 hover:bg-layer-1 motion-reduce:transition-none"
      >
        {t("workspace_products.requirements.baseline.view_detail")}
        <ChevronRight className="size-3.5 shrink-0" />
      </button>
    </div>
  );
}
