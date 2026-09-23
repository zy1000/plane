import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringProduct, TReviewTailoringSkippedMove } from "@plane/types";

const I18N = "review_tailoring.move_stage";

/** 收起记在本机，按「哪张表 · 第几次生效」记：下一次生效再有跳过项会重新出现 */
const storageKey = (tailoringId: string, revision: number) => `review-tailoring-skipped:${tailoringId}:${revision}`;

const readDismissed = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

/**
 * 已生效的表上，最近一次生效被跳过的移动：签批时这些活动已经评审完，留在了原阶段。
 *
 * 部分成功最怕「以为都挪了」，所以不只签批人当场的 toast，打开这张表的人都能看到；
 * 同样的内容在变更历史里一直查得到，这里点「知道了」就收起。
 */
export const SkippedMovesBanner = ({
  tailoringId,
  revision,
  skipped,
  products,
}: {
  tailoringId: string;
  revision: number;
  skipped: TReviewTailoringSkippedMove[];
  products: TReviewTailoringProduct[];
}) => {
  const { t } = useTranslation();
  const key = storageKey(tailoringId, revision);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed(key));
  }, [key]);

  if (skipped.length === 0 || dismissed) return null;
  const productById = new Map(products.map((product) => [product.id, product]));

  return (
    <div className="mx-6 mb-3 flex gap-3 rounded-xl border border-subtle bg-warning-subtle py-3 pr-3.5 pl-4">
      <span className="mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-full bg-surface-1 text-warning-primary">
        <AlertTriangle className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-13 text-secondary">
        <p className="mb-1.5 text-14 font-semibold text-primary">{t(`${I18N}.skipped_title`, { count: skipped.length })}</p>
        <ul className="flex flex-col gap-1">
          {skipped.map((move) => {
            const product = productById.get(move.product_id);
            return (
              <li key={move.item_id} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="text-primary">{move.title}</span>
                <span className="text-12 text-tertiary">{product?.identifier || product?.name}</span>
                <span className="text-12 text-tertiary">
                  {t(`${I18N}.skipped_item`, { stage: move.stage_label, target: move.target_stage_label })}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        className="h-7 shrink-0 self-start rounded-md border border-subtle bg-surface-1 px-2.5 text-13 whitespace-nowrap text-secondary hover:text-primary"
        onClick={() => {
          try {
            window.localStorage.setItem(key, "1");
          } catch {
            // 存不下就只在这次打开里收起
          }
          setDismissed(true);
        }}
      >
        {t(`${I18N}.skipped_dismiss`)}
      </button>
    </div>
  );
};
