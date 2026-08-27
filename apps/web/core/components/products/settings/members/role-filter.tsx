import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProductRole } from "@plane/types";
import { CustomMenu } from "@plane/ui";

export const UNASSIGNED_ROLE_FILTER = "unassigned";

type Props = {
  value: string[];
  roles: TProductRole[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
};

export function ProductMemberRoleFilter(props: Props) {
  const { value, roles, disabled = false, onChange } = props;
  const { t } = useTranslation();

  const toggleValue = (roleId: string) => {
    onChange(value.includes(roleId) ? value.filter((item) => item !== roleId) : [...value, roleId]);
  };

  const options = [
    { value: UNASSIGNED_ROLE_FILTER, label: t("workspace_products.settings.members.unassigned_role") },
    ...roles.map((role) => ({ value: String(role.id), label: role.name })),
  ];

  return (
    <CustomMenu
      disabled={disabled}
      placement="bottom-end"
      optionsClassName="w-56 p-1.5"
      customButton={
        <Button variant="secondary" size="lg" className="flex items-center gap-2" disabled={disabled}>
          <span>{t("workspace_products.settings.members.role_filter")}</span>
          {value.length > 0 && <span className="text-accent-primary">{value.length}</span>}
          <ChevronDown className="size-3" />
        </Button>
      }
    >
      {options.map((option) => {
        const isSelected = value.includes(option.value);
        return (
          <CustomMenu.MenuItem key={option.value} onClick={() => toggleValue(option.value)}>
            <div className="flex w-full items-center justify-between gap-3 px-1 py-0.5 text-12 text-secondary">
              <span className="truncate">{option.label}</span>
              <span className="grid size-4 shrink-0 place-items-center">
                {isSelected && <Check className="size-3.5 text-accent-primary" />}
              </span>
            </div>
          </CustomMenu.MenuItem>
        );
      })}
      {value.length > 0 && (
        <CustomMenu.MenuItem className="mt-1 border-t border-subtle pt-1" onClick={() => onChange([])}>
          <span className="px-1 text-12 text-tertiary">{t("workspace_products.settings.members.clear_filters")}</span>
        </CustomMenu.MenuItem>
      )}
    </CustomMenu>
  );
}
