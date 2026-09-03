import { useCallback, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

/**
 * 回滚到某一版的确认流程：记住目标版本 → 弹窗 → 确认后调接口、toast、通知调用方刷新。
 * 从旧版本列表平移过来，文案分支不变：回到已通过的那一版就是「放弃改动」，回到更早的版本才要重新评审。
 */
export const useRequirementRollback = ({
  rollback,
  approvedVersion,
  onDone,
}: {
  rollback: (version: number) => Promise<unknown>;
  approvedVersion: number | null;
  onDone?: () => void | Promise<void>;
}) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState<number | null>(null);

  const confirm = useCallback(async () => {
    if (target === null) return;
    try {
      await rollback(target);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t(
          target === approvedVersion
            ? "requirement_detail.modified_banner.discarded"
            : "requirement_detail.versions.rollback_done",
          { version: target }
        ),
      });
      await onDone?.();
    } catch (rollbackError) {
      const payload = rollbackError as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("requirement_detail.versions.rollback_failed"),
      });
    } finally {
      setTarget(null);
    }
  }, [approvedVersion, onDone, rollback, t, target]);

  return { target, request: setTarget, cancel: () => setTarget(null), confirm };
};
