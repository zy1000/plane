import { ChevronDown, Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";

/**
 * 建行弹窗顶上的需求类型选择器。
 *
 * 照工作项创建弹窗的排法：类型是表单的第一个字段，不是进表单前的一道关卡 —— 选完
 * 就地换掉下面那批自定义字段。类型视图里类型已由视图确定，那里传 disabled。
 */
type TProps = {
  types: TRequirementType[];
  value: string | null;
  onChange: (requirementTypeId: string) => void;
  disabled?: boolean;
};

export const RequirementTypeSelect = ({ types, value, onChange, disabled }: TProps) => {
  const { t } = useTranslation();
  const selected = types.find((requirementType) => requirementType.id === value);

  // 建行弹窗左栏第一个字段：与标题 Input 同高、同边、全宽，不再是一颗小芯片
  const button = (
    <span
      className={cn(
        "flex h-[38px] w-full items-center gap-1.5 rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 text-13 text-primary transition-colors duration-150",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-layer-1"
      )}
    >
      {selected ? (
        <TypeIcon iconProps={selected.logo_props?.icon} className="size-4 rounded" iconClassName="size-3" />
      ) : (
        <Layers className="size-3.5 shrink-0 text-placeholder" />
      )}
      <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-placeholder")}>
        {selected?.name ?? t("workspace_products.requirements.requirement_type_picker.title")}
      </span>
      {!disabled && <ChevronDown className="size-3 shrink-0 text-tertiary" />}
    </span>
  );

  return (
    <CustomMenu
      className="w-full"
      customButtonClassName="w-full"
      customButton={button}
      placement="bottom-start"
      maxHeight="lg"
      disabled={disabled}
      closeOnSelect
      ariaLabel={t("requirement_detail.requirement_type")}
    >
      {types.length === 0 ? (
        <p className="px-1 py-1.5 text-12 text-secondary">
          {t("workspace_products.requirements.requirement_type_picker.empty")}
        </p>
      ) : (
        types.map((requirementType) => (
          <CustomMenu.MenuItem key={requirementType.id} onClick={() => onChange(requirementType.id)}>
            <span className="flex min-w-0 items-center gap-2">
              <TypeIcon iconProps={requirementType.logo_props?.icon} className="size-4 rounded" iconClassName="size-3" />
              <span className="truncate">{requirementType.name}</span>
            </span>
          </CustomMenu.MenuItem>
        ))
      )}
    </CustomMenu>
  );
};
