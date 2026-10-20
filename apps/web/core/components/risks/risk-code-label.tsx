import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRisk } from "@plane/types";
import { cn } from "@plane/utils";
import { RISK_I18N } from "./constants";

type TTranslate = (key: string) => string;
type TCodeRisk = Pick<TRisk, "code" | "sync_status"> & { sync_error?: string };

/** 编号文字：有编号显编号；没有按推送状态显「生成中 / 未同步 / —」（不同步的风险永远是 —） */
export const getRiskCodeText = (t: TTranslate, risk: TCodeRisk) => {
  if (risk.code) return risk.code;
  if (risk.sync_status === "pending") return t(`${RISK_I18N}.sync.pending`);
  if (risk.sync_status === "failed") return t(`${RISK_I18N}.sync.failed`);
  return "—";
};

/**
 * 列表、抽屉顶栏、关联区块里的编号：等简道云生成时转圈，推送失败时红字 + 悬停原因。
 * 有编号但后来一次修改推送失败，也标红提醒（编号照显）。
 */
export const RiskCodeLabel = ({ risk, className }: { risk: TCodeRisk; className?: string }) => {
  const { t } = useTranslation();
  const text = getRiskCodeText(t, risk);
  const failed = risk.sync_status === "failed";
  const pending = risk.sync_status === "pending" && !risk.code;
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-12 whitespace-nowrap tabular-nums",
        failed ? "text-danger-primary" : pending ? "text-tertiary" : "text-secondary",
        className
      )}
    >
      {pending && <LoaderCircle className="size-3 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {failed && <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />}
      {text}
    </span>
  );
  if (!failed) return content;
  return (
    <Tooltip tooltipContent={risk.sync_error || t(`${RISK_I18N}.sync.failed_hint`)} position="top">
      {content}
    </Tooltip>
  );
};
