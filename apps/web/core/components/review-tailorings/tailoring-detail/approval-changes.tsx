import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringChange, TReviewTailoringProduct } from "@plane/types";
import { cn } from "@plane/utils";
import { TabBarSegments } from "./detail-tab-bar";

const I18N = "review_tailoring.approval";

type TChangeFilter = "all" | TReviewTailoringChange["type"];

const KIND_TAG: Record<TReviewTailoringChange["type"], string> = {
  add: "bg-success-subtle text-success-primary",
  cancel: "bg-layer-3 text-secondary",
  move: "bg-accent-subtle text-accent-primary",
};

/** 移动的去向「O-F1 → D阶段」；新增 / 取消只写所在阶段 */
const StagePath = ({ change }: { change: TReviewTailoringChange }) => (
  <span className="inline-flex shrink-0 items-center gap-1.5 text-12 whitespace-nowrap">
    {change.type === "move" ? (
      <>
        <span className="text-tertiary">{change.old_stage_label}</span>
        <ArrowRight className="size-3.5 text-placeholder" />
        <span className="font-semibold text-primary">{change.stage_label}</span>
      </>
    ) : (
      <span className="text-tertiary">{change.stage_label}</span>
    )}
  </span>
);

/**
 * 签批弹窗「改动明细」：修订相对生效快照改了哪些格子，新增 / 取消 / 移动三类并列。
 *
 * 数据是后端按已保存的格子算的（`pending_changes`），签批中的表不会再有本地改动。
 * 挪的是已评审的活动时整行琥珀底，标「已评审，将跳过」—— 生效时它会留在原阶段。
 */
export const ApprovalChanges = ({
  changes,
  products,
}: {
  changes: TReviewTailoringChange[];
  products: TReviewTailoringProduct[];
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<TChangeFilter>("all");
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const counts = useMemo(() => {
    const next = { add: 0, cancel: 0, move: 0 };
    for (const change of changes) next[change.type] += 1;
    return next;
  }, [changes]);
  const visible = filter === "all" ? changes : changes.filter((change) => change.type === filter);

  return (
    <div className="overflow-hidden rounded-xl border border-subtle">
      <div className="flex h-10 items-center border-b border-subtle bg-layer-1 px-2.5">
        <TabBarSegments
          value={filter}
          options={[
            { key: "all" as const, label: t(`${I18N}.changes_all`), count: changes.length },
            ...(["add", "cancel", "move"] as const)
              .filter((type) => counts[type] > 0)
              .map((type) => ({ key: type, label: t(`${I18N}.change_${type}`), count: counts[type] })),
          ]}
          onChange={setFilter}
        />
      </div>
      <ul className="max-h-72 overflow-y-auto">
        {visible.map((change) => {
          const product = productById.get(change.product_id);
          return (
            <li
              key={`${change.type}:${change.item_id}`}
              className={cn(
                "grid min-h-10.5 grid-cols-[3.25rem_5.75rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-subtle px-3.5 text-13 last:border-b-0",
                change.will_skip && "bg-warning-subtle"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 items-center justify-center rounded-[5px] text-11 font-semibold",
                  KIND_TAG[change.type]
                )}
              >
                {t(`${I18N}.change_${change.type}`)}
              </span>
              <span className="truncate text-12 text-secondary" title={product?.name}>
                {product?.identifier || product?.name || "—"}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-primary" title={change.title}>
                  {change.title}
                </span>
                {change.will_skip && (
                  <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-surface-1 px-1.5 text-11 font-medium text-warning-primary">
                    <AlertTriangle className="size-3" />
                    {t(`${I18N}.change_will_skip`)}
                  </span>
                )}
              </span>
              <StagePath change={change} />
            </li>
          );
        })}
      </ul>
    </div>
  );
};
