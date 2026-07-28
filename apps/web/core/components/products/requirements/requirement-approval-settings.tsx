import { Check, ChevronDown, Info, ListChecks, UserCheck, Users, type LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, IUserLite } from "@plane/types";
import { Avatar, MultiSelectDropdown } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

const approvalTypes: TRequirementApprovalType[] = ["any", "all", "n_of_m"];
const approvalTypeIcons: Record<TRequirementApprovalType, LucideIcon> = {
  any: UserCheck,
  all: Users,
  n_of_m: ListChecks,
};

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
  layout?: "stacked" | "cards";
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
  layout = "stacked",
}: TRequirementApprovalSettingsProps) {
  const { t } = useTranslation();
  const isCardLayout = layout === "cards";

  return (
    <div className={cn("space-y-5", className)}>
      <div className={cn(isCardLayout && "max-w-lg")}>
        <span className={cn("mb-2 block text-12 font-medium", isCardLayout ? "text-primary" : "text-secondary")}>
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
      <fieldset disabled={!approverIds.length} className={cn(!approverIds.length && "opacity-60")}>
        <legend className={cn("mb-3 block text-12 font-medium", isCardLayout ? "text-primary" : "text-secondary")}>
          {t("workspace_products.requirements.fields.approval_rule")}
        </legend>
        <div className={cn(isCardLayout ? "grid gap-3 lg:grid-cols-3" : "space-y-3")}>
          {approvalTypes.map((value) => {
            const Icon = approvalTypeIcons[value];
            const isSelected = approvalType === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex items-start gap-2.5 text-12 text-primary",
                  approverIds.length ? "cursor-pointer" : "cursor-not-allowed",
                  isCardLayout &&
                    "min-h-20 rounded-lg border border-subtle bg-surface-1 px-3 py-3 transition-colors focus-within:ring-2 focus-within:ring-accent-subtle hover:border-strong hover:bg-layer-1",
                  isCardLayout && isSelected && "border-accent-strong bg-accent-subtle"
                )}
              >
                <input
                  type="radio"
                  name={radioGroupName}
                  value={value}
                  checked={isSelected}
                  onChange={() => onApprovalTypeChange(value)}
                  className="accent-accent-primary mt-0.5 size-4 shrink-0"
                />
                {isCardLayout && (
                  <Icon
                    className={cn("mt-0.5 size-4 shrink-0", isSelected ? "text-accent-primary" : "text-secondary")}
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block", isCardLayout && "text-13 font-medium")}>
                    {t(`workspace_products.requirements.approval.${value}`)}
                  </span>
                  {isCardLayout && (
                    <span className="mt-1 block text-11 leading-4 text-secondary">
                      {t(`workspace_products.requirements.approval.${value}_description`)}
                    </span>
                  )}
                  {value === "n_of_m" && isSelected && approverIds.length > 0 && (
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-11 text-secondary">
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
            );
          })}
        </div>
      </fieldset>
      <p
        className={cn(
          "flex items-start gap-2 text-11 leading-5 text-secondary",
          isCardLayout && "rounded-lg border border-accent-subtle bg-accent-subtle px-3 py-2.5 text-12"
        )}
      >
        <Info className="mt-0.5 size-3.5 shrink-0 text-accent-primary" />
        {t("workspace_products.requirements.approval.configuration_only")}
      </p>
    </div>
  );
}
