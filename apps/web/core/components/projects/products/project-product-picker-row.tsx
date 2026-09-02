"use client";

import { Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TLogoProps } from "@plane/types";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";

type TProps = {
  name: string;
  identifier: string;
  logoProps?: TLogoProps | null;
  isSelected: boolean;
  isLinked: boolean;
  requirementCount: number;
  onToggle: () => void;
};

/**
 * 管理产品弹窗的一行：名称主、编号辅；选中只靠浅底，不再套描边卡片。
 * 勾选由整行承担，Checkbox 不单独接 onChange，避免点一次翻两次。
 */
export const ProjectProductPickerRow = (props: TProps) => {
  const { name, identifier, logoProps, isSelected, isLinked, requirementCount, onToggle } = props;
  const { t } = useTranslation();
  const title = name || identifier;
  const meta = isLinked
    ? requirementCount > 0
      ? t("project_products.requirement_count", { count: requirementCount })
      : t("project_products.linked")
    : t("project_products.unlinked_meta");

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
        isSelected
          ? "bg-accent-primary/5"
          : "hover:bg-layer-transparent-hover"
      )}
    >
      <span className="pointer-events-none">
        <Checkbox checked={isSelected} />
      </span>
      {logoProps?.in_use ? (
        <span className="grid size-3.5 shrink-0 place-items-center">
          <Logo logo={logoProps} size={14} />
        </span>
      ) : (
        <Package className="size-3.5 shrink-0 text-tertiary" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-13 font-medium text-primary" title={title}>
          {title}
        </span>
        {identifier && identifier !== title && (
          <span className="mt-0.5 block truncate text-caption-sm-regular text-tertiary">{identifier}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-11",
          isLinked ? "bg-layer-2 text-secondary" : "text-tertiary"
        )}
      >
        {meta}
      </span>
    </button>
  );
};
