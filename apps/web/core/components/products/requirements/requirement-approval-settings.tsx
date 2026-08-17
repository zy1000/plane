import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, IUserLite } from "@plane/types";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

const approvalTypes: TRequirementApprovalType[] = ["any", "all", "n_of_m"];

type TRequirementApprovalSettingsProps = {
  memberOptions: IUserLite[];
  approverIds: string[];
  approvalType: TRequirementApprovalType;
  requiredCount: number | null;
  onApproverIdsChange: (ids: string[]) => void;
  onApprovalTypeChange: (type: TRequirementApprovalType) => void;
  onRequiredCountChange: (count: number) => void;
  className?: string;
  radioGroupName?: string;
  /** 没有配置权限时整块只读 —— 配置不再受审批保护，能改的人必须更窄 */
  readOnly?: boolean;
};

/** 标签在上、控件在下，与产品通用设置其它字段同一套排布，字段间不加分割线 */
export function SettingsField({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-body-sm-medium text-primary">
        {label}
        {required && <span className="ml-0.5 text-danger-primary">*</span>}
      </p>
      <div className="min-w-0">
        {children}
        {/* 说明常显而不是塞进占位符：占位符一旦选了值就消失，而这些话恰恰是选完才需要 */}
        {help && <p className="mt-1.5 text-caption-md-regular text-tertiary">{help}</p>}
      </div>
    </div>
  );
}

/**
 * 审批人 + 通过规则。
 *
 * 规则用三行单选而不是三张卡：卡片里嵌下拉会让选中项当场撑高，三行也比三张卡更容易一眼
 * 比完。「指定人数」的计数控件常驻在它自己那一行右端，选中与否都不改变行高。
 */
export function RequirementApprovalSettings({
  memberOptions,
  approverIds,
  approvalType,
  requiredCount,
  onApproverIdsChange,
  onApprovalTypeChange,
  onRequiredCountChange,
  className,
  radioGroupName = "product-requirement-approval-type",
  readOnly = false,
}: TRequirementApprovalSettingsProps) {
  const { t } = useTranslation();
  const isRuleDisabled = readOnly || !approverIds.length;

  return (
    <div className={cn("space-y-6", className)}>
      <SettingsField label={t("workspace_products.requirements.fields.approvers")}>
        <div className="h-10 w-full">
          <MemberDropdown
            multiple
            value={approverIds}
            onChange={onApproverIdsChange}
            disabled={readOnly}
            memberIds={memberOptions.map((member) => member.id)}
            buttonVariant="border-with-text"
            className="h-full w-full"
            buttonClassName="h-full w-full border !border-subtle bg-surface-1"
            buttonContainerClassName="h-full w-full"
            placeholder={t("workspace_products.requirements.fields.select_approvers")}
            showUserDetails
          />
        </div>
      </SettingsField>

      <SettingsField label={t("workspace_products.requirements.fields.approval_rule")}>
        <fieldset disabled={isRuleDisabled} className={cn(isRuleDisabled && "opacity-60")}>
          <div className="divide-y divide-subtle overflow-hidden rounded-md border border-subtle">
            {approvalTypes.map((value) => {
              const isSelected = approvalType === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-9 items-center gap-2.5 px-3 py-1.5 text-12 text-primary transition-colors",
                    approverIds.length && !readOnly ? "cursor-pointer hover:bg-layer-1" : "cursor-not-allowed",
                    isSelected && "bg-accent-subtle"
                  )}
                >
                  <input
                    type="radio"
                    name={radioGroupName}
                    value={value}
                    checked={isSelected}
                    onChange={() => onApprovalTypeChange(value)}
                    className="accent-accent-primary size-3.5 shrink-0"
                  />
                  <span className="font-medium">{t(`workspace_products.requirements.approval.${value}`)}</span>
                  {value === "n_of_m" && (
                    /* 计数常驻这一行，不随选中长出来 —— 长出来就会把整块撑高 */
                    <span className="ml-auto flex items-center gap-1.5 text-11 text-secondary">
                      <select
                        value={requiredCount ?? 1}
                        disabled={isRuleDisabled || !isSelected}
                        onChange={(event) => onRequiredCountChange(Number(event.target.value))}
                        className="focus:border-accent-primary h-7 rounded border border-subtle bg-surface-1 px-1.5 text-12 text-primary tabular-nums outline-none disabled:opacity-50"
                      >
                        {Array.from({ length: Math.max(approverIds.length, 1) }, (_, index) => index + 1).map(
                          (count) => (
                            <option key={count} value={count}>
                              {count}
                            </option>
                          )
                        )}
                      </select>
                      <span className="tabular-nums">/ {approverIds.length}</span>
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      </SettingsField>
    </div>
  );
}
