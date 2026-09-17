import { Check, CircleAlert, RefreshCw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TStageReviewSaveState } from "@/hooks/store/use-stage-review-detail";

const I18N = "stage_review";

/**
 * 抽屉顶栏右侧的保存状态，替代「已保存」toast —— toast 固定在屏幕右下角，
 * 正好压住抽屉标题行以外的一切操作，而改字段是高频动作，不该每次都弹。
 *
 * 保存中转圈 → 已保存打勾（2 秒后由 hook 收起）→ 失败时红字常驻，点一下重试。
 * 空闲时不渲染内容，但留着占位宽度，免得右侧的链接 / 关闭按钮跟着左右跳。
 */
export const StageReviewSaveStatus = ({
  state,
  onRetry,
}: {
  state: TStageReviewSaveState;
  onRetry: () => void;
}) => {
  const { t } = useTranslation();

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-md bg-danger-subtle px-2 text-12 text-danger-primary transition hover:opacity-80"
      >
        <CircleAlert className="size-3.5" />
        {t(`${I18N}.detail.save_failed_retry`)}
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
          {t(`${I18N}.detail.saving`)}
        </>
      )}
      {/* 空闲时仍留着「已保存」这几个字，只是透明 —— 这样收起是淡出，不是一下子没了 */}
      {state !== "saving" && (
        <>
          <Check className="size-3.5 text-success-primary" strokeWidth={2.5} />
          {t(`${I18N}.detail.saved`)}
        </>
      )}
    </span>
  );
};
