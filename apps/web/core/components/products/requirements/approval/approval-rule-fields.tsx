/**
 * 提交评审弹窗里的审批人 + 通过规则。
 *
 * 审批人与规则不再是产品级配置 —— 每次提交时在这里选，只对本次提交的变更单有效。
 */
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Minus, Plus, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";

/** none 排最前：它是「走不走审批」的开关，与后面三条「怎么评」不是一个层级 */
const DEFAULT_APPROVAL_TYPES: TRequirementApprovalType[] = ["none", "any", "all", "n_of_m"];

const CARD_I18N_PREFIX = "workspace_products.requirements.approval.card";

type TRequirementApprovalRuleFieldsProps = {
  memberOptions: IUserLite[];
  approverIds: string[];
  approvalType: TRequirementApprovalType;
  requiredCount: number | null;
  onApproverIdsChange: (ids: string[]) => void;
  onApprovalTypeChange: (type: TRequirementApprovalType) => void;
  onRequiredCountChange: (count: number) => void;
  className?: string;
  /** 审批人字段下方的提示，例如审批人为空时的「请至少选择一名审批人」 */
  approversHelp?: string;
  /** 可选的规则子集；不传是全部四条 */
  approvalTypes?: TRequirementApprovalType[];
};

/** 标签在上、控件在下：13 号中粗字，必填红星 */
export function ApprovalFieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <p className="mb-2 flex items-center text-13 leading-5 font-medium text-primary">
      {children}
      {required && <span className="ml-0.5 text-danger-primary">*</span>}
    </p>
  );
}

/**
 * 审批人（头像药丸的多选）+ 通过规则（单选卡片）。
 *
 * 「指定人数」卡里常驻 −/N/+ 计数器，选中前禁用；选「无需审批」时审批人下拉禁用 ——
 * 名单在这条规则下没有意义，清空由表单 hook 负责，这里只负责展示。
 */
export function RequirementApprovalRuleFields({
  memberOptions,
  approverIds,
  approvalType,
  requiredCount,
  onApproverIdsChange,
  onApprovalTypeChange,
  onRequiredCountChange,
  className,
  approversHelp,
  approvalTypes = DEFAULT_APPROVAL_TYPES,
}: TRequirementApprovalRuleFieldsProps) {
  const { t } = useTranslation();
  const isApproverDisabled = approvalType === "none";
  const membersById = new Map(memberOptions.map((member) => [member.id, member]));
  const selectedMembers = approverIds
    .map((id) => membersById.get(id))
    .filter((member): member is IUserLite => Boolean(member));
  const total = approverIds.length;
  const count = Math.min(Math.max(requiredCount ?? 1, 1), Math.max(total, 1));

  const removeApprover = (event: MouseEvent | KeyboardEvent, id: string) => {
    // 药丸在下拉按钮里：拦住冒泡，删人时不顺手把下拉打开
    event.stopPropagation();
    event.preventDefault();
    onApproverIdsChange(approverIds.filter((item) => item !== id));
  };

  const approversButton = (
    <span
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-subtle-1 bg-layer-2 px-2 py-1.5 text-left transition-colors",
        isApproverDisabled ? "opacity-60" : "hover:border-strong"
      )}
    >
      {selectedMembers.map((member) => (
        <span
          key={member.id}
          className="inline-flex h-7 max-w-48 items-center gap-1.5 rounded-full bg-layer-3 py-0 pr-1.5 pl-0.5 text-13 text-primary"
        >
          <Avatar
            name={member.display_name}
            src={getFileURL(member.avatar_url ?? "")}
            fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(member)}
            size={22}
            showTooltip={false}
          />
          <span className="truncate">{member.display_name}</span>
          {!isApproverDisabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("remove")}
              onClick={(event) => removeApprover(event, member.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") removeApprover(event, member.id);
              }}
              className="grid size-4 shrink-0 place-items-center rounded-full text-tertiary hover:bg-layer-1 hover:text-primary"
            >
              <X className="size-3" />
            </span>
          )}
        </span>
      ))}
      <span className="px-1 text-13 text-placeholder">
        {t(
          isApproverDisabled
            ? "workspace_products.requirements.approval.approvers_not_needed"
            : "workspace_products.requirements.approval.add_approver"
        )}
      </span>
    </span>
  );

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div>
        <ApprovalFieldLabel required={!isApproverDisabled}>
          {t("workspace_products.requirements.fields.approvers")}
        </ApprovalFieldLabel>
        <MemberDropdown
          multiple
          value={approverIds}
          onChange={onApproverIdsChange}
          disabled={isApproverDisabled}
          memberIds={memberOptions.map((member) => member.id)}
          buttonVariant="border-with-text"
          className="w-full"
          buttonContainerClassName="w-full text-left"
          button={approversButton}
          placement="bottom-start"
        />
        {approversHelp && !isApproverDisabled && <p className="mt-1.5 text-12 text-tertiary">{approversHelp}</p>}
      </div>

      <div>
        <ApprovalFieldLabel>{t("workspace_products.requirements.fields.approval_rule")}</ApprovalFieldLabel>
        <div
          role="radiogroup"
          aria-label={t("workspace_products.requirements.fields.approval_rule")}
          className={cn("grid grid-cols-1 gap-2.5", approvalTypes.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
        >
          {approvalTypes.map((value) => {
            const isSelected = approvalType === value;
            return (
              <div
                key={value}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => onApprovalTypeChange(value)}
                onKeyDown={(event) => {
                  // 只处理卡片自身的按键；焦点在内部 −/+ 按钮上时让按钮自己响应回车 / 空格
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onApprovalTypeChange(value);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-[10px] border px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
                  isSelected
                    ? "border-accent-strong bg-accent-subtle ring-1 ring-accent-strong ring-inset"
                    : "border-subtle-1 bg-surface-1 hover:bg-layer-1"
                )}
              >
                <span className="flex items-center gap-2 text-14 font-semibold text-primary">
                  <span
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 rounded-full",
                      isSelected ? "border-[5px] border-accent-strong" : "border-[1.5px] border-strong"
                    )}
                  />
                  {t(`${CARD_I18N_PREFIX}.${value}`)}
                </span>
                {value === "n_of_m" && (
                  <span
                    className={cn(
                      "mt-1 ml-6 inline-flex w-max items-center overflow-hidden rounded-md border bg-surface-1",
                      isSelected ? "border-accent-subtle" : "border-subtle"
                    )}
                  >
                    <button
                      type="button"
                      aria-label="-"
                      disabled={!isSelected || count <= 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRequiredCountChange(count - 1);
                      }}
                      className="grid h-6.5 min-w-6.5 place-items-center text-secondary hover:bg-layer-1 disabled:text-disabled disabled:hover:bg-transparent"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <b className="grid h-6.5 min-w-8 place-items-center border-x border-subtle px-2 text-13 font-semibold text-primary tabular-nums">
                      {count}
                    </b>
                    <button
                      type="button"
                      aria-label="+"
                      disabled={!isSelected || count >= Math.max(total, 1)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRequiredCountChange(count + 1);
                      }}
                      className="grid h-6.5 min-w-6.5 place-items-center text-secondary hover:bg-layer-1 disabled:text-disabled disabled:hover:bg-transparent"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                )}
                <span className="pl-6 text-12 text-tertiary">
                  {value === "n_of_m"
                    ? t(`${CARD_I18N_PREFIX}_desc.n_of_m`, { total, count })
                    : t(`${CARD_I18N_PREFIX}_desc.${value}`)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
