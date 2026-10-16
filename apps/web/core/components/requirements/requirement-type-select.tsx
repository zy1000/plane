import { useMemo } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementType } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";

/**
 * 建行弹窗顶上的需求类型选择器。
 *
 * 照工作项创建弹窗的排法：类型是表单的第一个字段，不是进表单前的一道关卡 —— 选完
 * 就地换掉下面那批自定义字段。类型可能很多，所以是带搜索的下拉而不是一排卡片。
 * 类型视图里类型已由视图确定，那里传 disabled。
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

  const options = useMemo(
    () =>
      types.map((requirementType) => ({
        value: requirementType.id,
        query: requirementType.name,
        content: (
          <span className="flex min-w-0 items-center gap-2 text-13 text-primary">
            <TypeIcon iconProps={requirementType.logo_props?.icon} className="size-5 rounded-md" iconClassName="size-3" />
            <span className="truncate">{requirementType.name}</span>
          </span>
        ),
      })),
    [types]
  );

  // 与标题输入框同高、同边：40px、8px 圆角、14 号字
  const button = (
    <span className="flex h-10 w-full min-w-0 items-center gap-2.5 px-3 text-14">
      {selected ? (
        <TypeIcon iconProps={selected.logo_props?.icon} className="size-5.5 rounded-md" iconClassName="size-3.25" />
      ) : (
        <Layers className="size-4 shrink-0 text-placeholder" />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-left ${selected ? "text-primary" : "text-placeholder"}`}
      >
        {selected?.name ?? t("workspace_products.requirements.requirement_type_picker.title")}
      </span>
      {!disabled && <ChevronDown className="size-3.75 shrink-0 text-placeholder" />}
    </span>
  );

  return (
    <CustomSearchSelect
      value={value}
      onChange={(next: string) => onChange(next)}
      options={options}
      customButton={button}
      customButtonClassName={cn(
        "w-full rounded-lg border border-subtle-1 bg-layer-2 transition-colors",
        disabled ? "opacity-60" : "hover:bg-layer-2-hover"
      )}
      className="w-full"
      optionsClassName="z-50 min-w-64"
      placement="bottom-start"
      maxHeight="lg"
      disabled={disabled}
      noResultsMessage={t("workspace_products.requirements.requirement_type_picker.empty")}
    />
  );
};
