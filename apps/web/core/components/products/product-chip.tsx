"use client";

import { Package } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIdentifierTextVariant, TIssueIdentifierSize } from "@plane/types";
import { cn } from "@plane/utils";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

/**
 * 一个产品的展示单元：标识徽标 + 名称。
 *
 * 在此之前全仓库**没有任何地方渲染过产品标识** —— 产品列表、产品切换器都只有名字，
 * identifier 只在新建/编辑表单里出现过。但在项目侧，「这条需求来自哪个产品」是整个
 * 「需求进项目」链路里最需要一眼看到的信息，一段纯文本的产品名撑不起它。
 *
 * 复用工作项的 IdentifierText（纯展示、零 store 依赖），只把复制 toast 的文案换成
 * 产品语义 —— 那个组件的默认文案是硬编码的 "Work item ID copied to clipboard"。
 * 这与 RequirementIdentifier 是同一套做法。
 */

type TProps = {
  identifier: string | null | undefined;
  name?: string | null;
  /** 给了就整体变成链接，点进该产品的需求页 */
  href?: string;
  size?: TIssueIdentifierSize;
  variant?: TIdentifierTextVariant;
  enableClickToCopy?: boolean;
  /** 只要徽标，不要名字（窄列里用） */
  hideName?: boolean;
  /**
   * plain = 图标+文字（标签页、peek 头等内联场景）。
   * property = 工作项行右侧属性同款描边壳（迭代范围需求列表等）。
   */
  appearance?: "plain" | "property";
  className?: string;
};

export const ProductChip = (props: TProps) => {
  const {
    identifier,
    name,
    href,
    size = "xs",
    variant = "secondary",
    enableClickToCopy = false,
    hideName = false,
    appearance = "plain",
    className,
  } = props;
  const { t } = useTranslation();

  if (!identifier && !name) return null;

  const isProperty = appearance === "property";

  const body = (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5",
        isProperty &&
          "h-5 max-w-full whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-md-medium text-secondary",
        className
      )}
    >
      <Package className={cn("shrink-0 text-tertiary", isProperty ? "size-3" : "size-3.5")} />
      {identifier && (
        <IdentifierText
          identifier={identifier}
          size={size}
          variant={variant}
          // 链接态下不能再挂复制：点一下到底是复制还是跳转，用户猜不到
          enableClickToCopyIdentifier={enableClickToCopy && !href}
          copyToastTitle={t("workspace_products.identifier_copied")}
        />
      )}
      {!hideName && name && (
        <span className={cn("min-w-0 truncate", isProperty ? "text-caption-md-medium" : "text-13")}>{name}</span>
      )}
    </span>
  );

  const content = hideName && name ? <Tooltip tooltipContent={name}>{body}</Tooltip> : body;

  if (!href) return content;

  return (
    <Link
      to={href}
      className={cn("inline-flex min-w-0 items-center hover:text-accent-primary", isProperty && "h-5")}
    >
      {content}
    </Link>
  );
};
