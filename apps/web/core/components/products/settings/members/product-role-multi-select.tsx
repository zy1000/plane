import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductRole } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";

type Props = {
  value: number[];
  roles: TProductRole[];
  selectedRoleDetails?: TProductRole[];
  isLoading?: boolean;
  disabled?: boolean;
  onChange: (roleIds: number[]) => void | Promise<void>;
};

export function ProductRoleMultiSelect(props: Props) {
  const { value, roles, selectedRoleDetails = [], isLoading = false, disabled = false, onChange } = props;
  const { t } = useTranslation();

  const displayRoles = useMemo(
    () => Array.from(new Map([...roles, ...selectedRoleDetails].map((role) => [role.id, role])).values()),
    [roles, selectedRoleDetails]
  );
  const selectedValues = value.map(String);
  const options = roles.map((role) => ({ value: String(role.id), data: role }));
  const selectedNames = displayRoles.filter((role) => value.includes(role.id)).map((role) => role.name);

  const buttonLabel = isLoading
    ? t("workspace_products.settings.members.loading_roles")
    : selectedNames.length === 0
      ? t("workspace_products.settings.members.unassigned_role")
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames[0]} +${selectedNames.length - 1}`;

  return (
    <MultiSelectDropdown
      value={selectedValues}
      onChange={(roleIds) => void onChange(roleIds.map(Number))}
      options={options}
      disabled={disabled || isLoading}
      disableSorting
      keyExtractor={(option) => option.value}
      queryArray={["name"]}
      inputPlaceholder={t("workspace_products.settings.members.role_search")}
      buttonContent={() => (
        <div className="flex w-full min-w-0 items-center justify-between gap-1 text-13">
          <span className={selectedNames.length === 0 ? "truncate text-placeholder" : "truncate"}>{buttonLabel}</span>
          <ChevronDown className="size-3 shrink-0 text-secondary" />
        </div>
      )}
      buttonClassName="flex w-full items-center justify-between gap-1 rounded border-none px-0 py-1 text-13"
      containerClassName="w-full rounded-md p-0"
      optionsContainerClassName="w-56"
      renderItem={({ value: roleId, selected }) => {
        const role = roles.find((item) => String(item.id) === roleId);
        if (!role) return null;
        return (
          <div className="flex w-full items-center justify-between gap-2 truncate text-13">
            <span className="truncate">{role.name}</span>
            {selected && <Check className="size-3 shrink-0" />}
          </div>
        );
      }}
    />
  );
}
