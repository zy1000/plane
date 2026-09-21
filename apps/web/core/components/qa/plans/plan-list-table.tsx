/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar, CustomMenu } from "@plane/ui";
import { cn, getFileURL, renderFormattedPayloadDate } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { useMember } from "@/hooks/store/use-member";
import { getPlanReviewRuleLabel, type TPlanListRow } from "@/services/qa/plan.service";
import { PlanPassRate } from "./plan-pass-rate";

/** 各列按比例分宽度，名称列不独占剩余空间；顺序即视觉顺序 */
const GRID_TEMPLATE_COLUMNS =
  "minmax(320px, 2.4fr) minmax(76px, 0.6fr) minmax(84px, 0.7fr) minmax(96px, 0.8fr) minmax(92px, 0.8fr) minmax(112px, 1fr) minmax(116px, 1fr) minmax(112px, 1fr)";

/** 每格自己带右竖线和内边距，最后一格不画线 */
const CELL = "flex h-full min-w-0 items-center border-r border-subtle px-3 last:border-r-0";

const HEADERS = ["计划名称", "用例数", "通过率", "状态", "执行结果", "执行人", "复核人", "计划周期"];

const TAG = "inline-flex h-[22px] items-center rounded px-2 text-12 font-medium";

/** 状态标签配色：未开始灰、进行中品牌蓝、已完成绿 */
const STATE_TAG: Record<string, string> = {
  未开始: "bg-layer-3 text-secondary",
  进行中: "bg-accent-subtle text-accent-primary",
  已完成: "bg-success-subtle text-success-primary",
};

/** 没有值就留空，不放占位符 */
const Empty = () => null;

const shortDate = (value: string) => value.slice(5, 10);

/** 单人显示头像 + 名字，多人显示叠放头像组 */
const People = observer(function People({ userIds }: { userIds: string[] }) {
  const { getUserDetails } = useMember();
  if (userIds.length === 1) {
    const user = getUserDetails(userIds[0]);
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar size="sm" name={user?.display_name ?? ""} src={getFileURL(user?.avatar_url ?? "")} showTooltip={false} />
        <span className="truncate text-13 text-secondary">{user?.display_name ?? ""}</span>
      </span>
    );
  }
  return <ButtonAvatars userIds={userIds} size="sm" showTooltip={false} />;
});

/** 只读：无编辑权限也能点开查看完整人员名单 */
const ViewOnlyPeople = observer(function ViewOnlyPeople({
  userIds,
  caption,
}: {
  userIds: string[];
  caption?: string;
}) {
  if (userIds.length === 0) return <Empty />;
  return (
    <MemberDropdown
      multiple
      value={userIds}
      onChange={() => {}}
      disabled
      caption={caption}
      button={<People userIds={userIds} />}
      buttonContainerClassName="min-w-0 max-w-full overflow-hidden text-left p-0 cursor-pointer text-secondary"
      optionsClassName="z-[60]"
    />
  );
});

type Props = {
  plans: TPlanListRow[];
  canEdit: boolean;
  canDelete: boolean;
  onOpen: (plan: TPlanListRow) => void;
  onEdit: (plan: TPlanListRow) => void;
  onDelete: (plan: TPlanListRow) => void;
};

/**
 * 测试计划列表：点计划名称进计划用例页；编辑 / 删除收在名称格右端的「⋯」里，悬停该行才出现。
 */
export const PlanListTable = ({ plans, canEdit, canDelete, onOpen, onEdit, onDelete }: Props) => {
  const today = renderFormattedPayloadDate(new Date()) ?? "";
  const showMenu = canEdit || canDelete;

  return (
    <div className="min-w-fit border-b border-subtle">
      <div
        className="sticky top-0 z-[2] grid h-9 border-b border-subtle bg-layer-1 text-12 text-tertiary"
        style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
      >
        {HEADERS.map((header, index) => (
          <span key={index} className={CELL}>
            <span className="truncate">{header}</span>
          </span>
        ))}
      </div>

      {plans.map((plan) => {
        const assignees = (plan.assignee_ids ?? []).map(String);
        const reviewers = (plan.reviewers ?? []).map(String);
        const ruleLabel = getPlanReviewRuleLabel(plan);
        const isLate = Boolean(plan.end_time) && String(plan.end_time) < today && plan.state !== "已完成";
        return (
          <div
            key={plan.id}
            className="group/row grid h-[50px] border-b border-subtle transition-colors hover:bg-layer-1"
            style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
          >
            <span className={cn(CELL, "gap-2")}>
              <button
                type="button"
                onClick={() => onOpen(plan)}
                title={plan.name}
                className="min-w-0 flex-1 truncate text-left text-13 font-medium text-primary hover:text-accent-primary hover:underline"
              >
                {plan.name}
              </button>
              {showMenu && (
                <CustomMenu
                  ellipsis
                  closeOnSelect
                  placement="bottom-end"
                  buttonClassName="opacity-0 transition-opacity group-hover/row:opacity-100 aria-expanded:opacity-100"
                >
                  {canEdit && (
                    <CustomMenu.MenuItem onClick={() => onEdit(plan)}>
                      <span className="flex items-center gap-2">
                        <Pencil className="size-3.5" strokeWidth={1.75} />
                        编辑
                      </span>
                    </CustomMenu.MenuItem>
                  )}
                  {canDelete && (
                    <CustomMenu.MenuItem onClick={() => onDelete(plan)}>
                      <span className="flex items-center gap-2 text-danger-primary">
                        <Trash2 className="size-3.5" strokeWidth={1.75} />
                        删除
                      </span>
                    </CustomMenu.MenuItem>
                  )}
                </CustomMenu>
              )}
            </span>
            <span className={cn(CELL, "text-13 tabular-nums text-secondary")}>{plan.case_count ?? 0}</span>
            <span className={CELL}>
              <PlanPassRate plan={plan} />
            </span>
            <span className={CELL}>
              {plan.state ? <span className={cn(TAG, STATE_TAG[plan.state] ?? STATE_TAG["未开始"])}>{plan.state}</span> : null}
            </span>
            <span className={CELL}>
              {plan.result === "通过" || plan.result === "不通过" ? (
                <span
                  className={cn(
                    TAG,
                    plan.result === "通过"
                      ? "bg-success-subtle text-success-primary"
                      : "bg-danger-subtle text-danger-primary"
                  )}
                >
                  {plan.result}
                </span>
              ) : (
                <Empty />
              )}
            </span>
            <span className={CELL}>
              <ViewOnlyPeople userIds={assignees} />
            </span>
            <span className={CELL}>
              <ViewOnlyPeople userIds={reviewers} caption={ruleLabel || undefined} />
            </span>
            <span className={cn(CELL, "text-13 tabular-nums", isLate ? "text-danger-primary" : "text-secondary")}>
              {plan.begin_time || plan.end_time
                ? [plan.begin_time, plan.end_time].map((value) => (value ? shortDate(String(value)) : "")).join(" → ")
                : <Empty />}
            </span>
          </div>
        );
      })}

      {plans.length === 0 && (
        <div className="flex h-48 items-center justify-center text-13 text-placeholder">暂无测试计划</div>
      )}
    </div>
  );
};
