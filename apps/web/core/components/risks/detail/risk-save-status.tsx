import { Check, CircleAlert, RefreshCw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TRiskSaveState } from "@/hooks/store/use-risk-detail";
import { RISK_I18N } from "../constants";

/**
 * 抽屉顶栏的保存状态，替代「已保存」toast —— 改字段是高频动作，不该每次都在右下角弹一条。
 *
 * 保存中转圈 → 已保存打勾（2 秒后由 hook 收起）→ 失败时红字常驻，点一下重试。
 * 空闲时不渲染内容，但留着占位宽度，免得右侧的按钮跟着左右跳。口径同阶段评审。
 */
export const RiskSaveStatus = ({ state, onRetry }: { state: TRiskSaveState; onRetry: () => void }) => {
  const { t } = useTranslation();

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-md bg-danger-subtle px-2 text-12 text-danger-primary transition hover:opacity-80"
      >
        <CircleAlert className="size-3.5" />
        {t(`${RISK_I18N}.detail.save_failed`)} · {t(`${RISK_I18N}.detail.retry`)}
      </button>
    );
  }

  return (
    <span
      aria-live="polite"
      aria-hidden={state === "idle"}
      className={cn(
        "inline-flex h-6.5 min-w-18 shrink-0 items-center justify-end gap-1.5 px-2 text-12 text-placeholder transition-opacity duration-300",
        state === "idle" ? "opacity-0" : "opacity-100"
      )}
    >
      {state === "saving" && (
        <>
          <RefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" />
          {t(`${RISK_I18N}.detail.saving`)}
        </>
      )}
      {/* 空闲时仍留着「已保存」这几个字，只是透明 —— 收起是淡出，不是一下子没了 */}
      {state !== "saving" && (
        <>
          <Check className="size-3.5 text-success-primary" strokeWidth={2.5} />
          {t(`${RISK_I18N}.detail.saved`)}
        </>
      )}
    </span>
  );
};
