import { Check, ChevronDown, Info } from "lucide-react";
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
};

function UserOption({ user }: { user: IUserLite }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} size="sm" className="shrink-0" />
      <span className="truncate">{user.display_name}</span>
    </span>
  );
}

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
}: TRequirementApprovalSettingsProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <span className="mb-2 block text-12 font-medium text-secondary">
          {t("workspace_products.requirements.fields.approvers")}
        </span>
        <MultiSelectDropdown
          value={approverIds}
          onChange={onApproverIdsChange}
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
                    {selectedMembers.slice(0, 3).map((member) => (
                      <span
                        key={member.id}
                        className="flex h-7 min-w-0 items-center gap-1.5 rounded bg-layer-2 px-1.5 text-11 text-primary"
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
                    {selectedMembers.length > 3 && (
                      <span className="text-11 text-secondary">+{selectedMembers.length - 3}</span>
                    )}
                  </>
                ) : (
                  <span className="truncate text-11 text-placeholder">
                    {t("workspace_products.requirements.approval.unconfigured")}
                  </span>
                )}
                <ChevronDown className="ml-auto size-3.5 shrink-0 text-placeholder" />
              </div>
            );
          }}
          buttonContainerClassName="min-h-10 w-full rounded-md border border-subtle bg-surface-1 px-2 py-1.5"
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
      </div>
      <fieldset disabled={!approverIds.length} className="disabled:opacity-60">
        <legend className="mb-3 block text-12 font-medium text-secondary">
          {t("workspace_products.requirements.fields.approval_rule")}
        </legend>
        <div className="space-y-3">
          {approvalTypes.map((value) => (
            <label key={value} className="flex cursor-pointer items-start gap-2.5 text-12 text-primary">
              <input
                type="radio"
                name={radioGroupName}
                value={value}
                checked={approvalType === value}
                onChange={() => onApprovalTypeChange(value)}
                className="accent-accent-primary mt-0.5 size-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block">{t(`workspace_products.requirements.approval.${value}`)}</span>
                {value === "n_of_m" && approvalType === "n_of_m" && approverIds.length > 0 && (
                  <span className="mt-2 flex items-center gap-2 text-11 text-secondary">
                    <select
                      value={requiredCount ?? 1}
                      onChange={(event) => onRequiredCountChange(Number(event.target.value))}
                      className="focus:border-accent-primary h-8 w-16 rounded-md border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none"
                    >
                      {Array.from({ length: approverIds.length }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                    {t("workspace_products.requirements.approval.n_summary", {
                      required: requiredCount ?? 1,
                      total: approverIds.length,
                    })}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="flex items-start gap-2 text-11 leading-5 text-secondary">
        <Info className="mt-0.5 size-3.5 shrink-0 text-accent-primary" />
        {t("workspace_products.requirements.approval.configuration_only")}
      </p>
    </div>
  );
}
