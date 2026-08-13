import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, IUserLite } from "@plane/types";
import { Avatar, MultiSelectDropdown } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

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

function UserOption({ user }: { user: IUserLite }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} size="sm" className="shrink-0" />
      <span className="truncate">{user.display_name}</span>
    </span>
  );
}

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
        <MultiSelectDropdown
          value={approverIds}
          onChange={onApproverIdsChange}
          disabled={readOnly}
          options={memberOptions.map((member) => ({ value: member.id, data: member }))}
          keyExtractor={(option) => option.value}
          queryArray={["display_name", "email"]}
          inputPlaceholder={t("workspace_products.requirements.fields.select_approvers")}
          buttonContent={(_isOpen, selectedIds) => {
            const selectedMembers = ((selectedIds as string[] | undefined) ?? [])
              .map((id) => memberOptions.find((member) => member.id === id))
              .filter((member): member is IUserLite => Boolean(member));
            return (
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {selectedMembers.length ? (
                  <>
                    {selectedMembers.slice(0, 4).map((member) => (
                      <span
                        key={member.id}
                        className="flex h-6 min-w-0 items-center gap-1.5 rounded bg-layer-2 px-1.5 text-11 text-primary"
                      >
                        <Avatar
                          name={member.display_name}
                          src={getFileURL(member.avatar_url ?? "")}
                          size="sm"
                          className="shrink-0"
                        />
                        <span className="max-w-20 truncate">{member.display_name}</span>
                      </span>
                    ))}
                    {selectedMembers.length > 4 && (
                      <span className="text-11 text-secondary">+{selectedMembers.length - 4}</span>
                    )}
                  </>
                ) : (
                  <span className="truncate text-11 text-placeholder">
                    {t("workspace_products.requirements.fields.select_approvers")}
                  </span>
                )}
                <ChevronDown className="ml-auto size-3.5 shrink-0 text-placeholder" />
              </div>
            );
          }}
          buttonContainerClassName="min-h-8.5 w-full rounded-md border border-subtle bg-surface-1 px-2 py-1"
          optionsContainerClassName="w-[min(20rem,calc(100vw-2rem))]"
          renderItem={({ value, selected }) => {
            const member = memberOptions.find((option) => option.id === value);
            if (!member) return null;
            return (
              <div className="flex w-full items-center justify-between gap-2">
                <UserOption user={member} />
                {selected && <Check className="size-3.5 shrink-0 text-accent-primary" />}
              </div>
            );
          }}
        />
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
                  {value === "n_of_m" ? (
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
                  ) : (
                    <span className="ml-auto text-11 text-tertiary">
                      {t(`workspace_products.requirements.configuration.rule_tone.${value}`)}
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
