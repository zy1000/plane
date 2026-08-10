"use client";

import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIdentifierTextVariant, TIssueIdentifierSize } from "@plane/types";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

/**
 * 一条需求的展示编号，以及（如果是从标准库导入的）它的来源编号。
 *
 * 两个编号都是**服务端拼好**的（display_id / source_display_id）—— 前缀取自所属
 * 产品/库的 identifier，前端不参与拼装，所以库改名后来源编号会自动跟随。
 *
 * 复用工作项的 IdentifierText（纯展示、零 store 依赖），只把复制 toast 的文案换成
 * 需求语义 —— 那个组件的默认文案是硬编码的 "Work item ID copied to clipboard"。
 */

type TProps = {
  displayId: string | null | undefined;
  /** 来源标准库编号，如 "SEC-12"；手工录入的需求为空 */
  sourceDisplayId?: string | null;
  size?: TIssueIdentifierSize;
  variant?: TIdentifierTextVariant;
  enableClickToCopy?: boolean;
};

export const RequirementIdentifier = (props: TProps) => {
  const { displayId, sourceDisplayId, size = "xs", variant = "secondary", enableClickToCopy = false } = props;
  const { t } = useTranslation();

  if (!displayId) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <IdentifierText
        identifier={displayId}
        size={size}
        variant={variant}
        enableClickToCopyIdentifier={enableClickToCopy}
        copyToastTitle={t("requirements.identifier.copied")}
      />
      {sourceDisplayId && (
        // 来源编号刻意比自身编号更弱：它是溯源信息，不是这条需求的身份
        <Tooltip tooltipContent={t("requirements.identifier.source_tooltip")} position="top">
          <span className="text-caption-sm-regular whitespace-nowrap text-tertiary">←&nbsp;{sourceDisplayId}</span>
        </Tooltip>
      )}
    </span>
  );
};
