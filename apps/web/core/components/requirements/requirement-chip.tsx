"use client";

import { Link } from "react-router";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

/**
 * 一条需求的只读芯片：编号 + 标题，壳照 ProductChip 的 appearance="property"
 * 版式（h-5 rounded-sm border-[0.5px] border-strong）—— 挂在工作项详情/peek
 * 属性栏的「需求」行，与相邻属性行的描边胶囊视觉一致。
 *
 * 只读是刻意的：这里只回答「这条工作项拆自哪条需求」，改关联要回需求侧的
 * 「关联工作项」section 操作（文档 §6.1），所以不提供任何编辑/清除入口。
 * 编号由服务端拼好（requirement_display_id），前端不参与拼装。
 */

type TProps = {
  /** 拼好的展示编号（如 ECOM-12） */
  displayId: string;
  name: string;
  /** 给了就整体变成链接，点进产品需求详情页 */
  href?: string;
  className?: string;
};

export const RequirementChip = (props: TProps) => {
  const { displayId, name, href, className } = props;

  const body = (
    // 芯片名称截断靠 min-w-0 + truncate；完整标题走 Tooltip 兜底
    <span
      className={cn(
        "inline-flex h-5 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-md-medium text-secondary",
        className
      )}
    >
      <IdentifierText identifier={displayId} size="xs" variant="secondary" />
      <span className="min-w-0 truncate text-caption-md-medium">{name}</span>
    </span>
  );

  const content = <Tooltip tooltipContent={name}>{body}</Tooltip>;

  if (!href) return content;

  return (
    <Link to={href} className="inline-flex h-5 min-w-0 max-w-full items-center hover:text-accent-primary">
      {content}
    </Link>
  );
};
