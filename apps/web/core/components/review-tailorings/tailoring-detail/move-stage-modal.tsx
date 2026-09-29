import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringItem, TReviewTailoringModeStage, TReviewTailoringProduct } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { PLAIN_TD, PLAIN_TH } from "../plain-table";
import { RadioDot, TailoringFacts, TailoringModalFooter, TailoringModalHeader } from "./modal-frame";

const I18N = "review_tailoring.move_stage";
/** 列：单选 / 编码 / 阶段 / 阶段类型 / 说明 */
const COLS = "grid grid-cols-[2.75rem_5rem_minmax(0,1fr)_10rem_8rem] items-center";
/** 「产品」一项里最多写几个编号，多出来的写 +N */
const MAX_PRODUCTS = 4;

type TBlock = "current" | "conflict" | null;

/**
 * 「移到阶段」弹窗：把一批评审活动格子挪到本项目的另一个阶段。
 *
 * 候选是本项目的全部阶段（父子皆有，树先序缩进），不限阶段类型。两种阶段不能选：
 * - 当前阶段（这批格子都已经在那里）；
 * - 已有同一活动的阶段（同一产品 × 节点在那里已经有格子，o-1、o-2 都勾了它的情形）——
 *   服务端会整批拒绝，这里提前置灰。
 *
 * 汇总评审与已评审的格子在打开前就被调用方排除了，页脚写明排除了几格。
 */
export const MoveStageModal = ({
  isOpen,
  cells,
  excludedCount,
  items,
  stages,
  products,
  parentTitle,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  /** 要挪的格子（已排除汇总评审与已评审） */
  cells: TReviewTailoringItem[];
  /** 选区里被排除的格子数 */
  excludedCount: number;
  /** 本地全部格子：查目标阶段有没有同一活动 */
  items: TReviewTailoringItem[];
  stages: TReviewTailoringModeStage[];
  products: TReviewTailoringProduct[];
  /** 只有一种活动时，它所属评审的标题（「挪过去后脱离 X」） */
  parentTitle?: string;
  onClose: () => void;
  onConfirm: (stage: TReviewTailoringModeStage) => void;
}) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setPicked(null);
  }, [isOpen]);

  const titles = useMemo(() => [...new Set(cells.map((cell) => cell.title))], [cells]);
  const currentStages = useMemo(() => [...new Set(cells.map((cell) => cell.stage_label))], [cells]);

  const blockOf = useMemo(() => {
    const moving = new Set(cells.map((cell) => cell.id));
    const occupied = new Set(
      items
        .filter((item) => !moving.has(item.id))
        .map((item) => `${item.product_id}:${item.stage_id}:${item.template_id}`)
    );
    return (stageId: string): TBlock => {
      if (cells.every((cell) => cell.stage_id === stageId)) return "current";
      if (cells.some((cell) => occupied.has(`${cell.product_id}:${stageId}:${cell.template_id}`))) return "conflict";
      return null;
    };
  }, [cells, items]);

  const productText = useMemo(() => {
    const ids = [...new Set(cells.map((cell) => cell.product_id))];
    const byId = new Map(products.map((product) => [product.id, product]));
    const labels = ids.map((id) => byId.get(id)?.identifier || byId.get(id)?.name || "");
    const shown = labels.slice(0, MAX_PRODUCTS).join("、");
    return labels.length > MAX_PRODUCTS ? `${shown} +${labels.length - MAX_PRODUCTS}` : shown;
  }, [cells, products]);

  const target = stages.find((stage) => stage.id === picked);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <TailoringModalHeader title={t(`${I18N}.title`)} onClose={onClose} />

      <div className="px-6 pt-5 pb-4">
        <TailoringFacts
          items={[
            {
              label: t(`${I18N}.fact_activity`),
              value: titles.length === 1 ? titles[0] : t(`${I18N}.subtitle_many`, { count: titles.length }),
            },
            { label: t(`${I18N}.tag_current`), value: currentStages.join("、") },
            ...(parentTitle ? [{ label: t(`${I18N}.fact_parent`), value: parentTitle }] : []),
            { label: t("review_tailoring.actions.add_axes_col_product"), value: productText },
          ]}
        />
      </div>

      <p className="px-6 pb-2 text-13 font-medium text-secondary">
        {t(`${I18N}.target`)}
        <span className="ml-1 text-danger-primary">*</span>
      </p>
      <div role="radiogroup" className="border-t border-subtle">
        <div className={COLS}>
          <span className={cn(PLAIN_TH, "h-9.5 border-r-0")} />
          <span className={cn(PLAIN_TH, "flex h-9.5 items-center border-r-0")}>{t(`${I18N}.col_code`)}</span>
          <span className={cn(PLAIN_TH, "flex h-9.5 items-center border-r-0")}>{t(`${I18N}.col_stage`)}</span>
          <span className={cn(PLAIN_TH, "flex h-9.5 items-center border-r-0")}>{t(`${I18N}.col_type`)}</span>
          <span className={cn(PLAIN_TH, "flex h-9.5 items-center border-r-0")}>{t(`${I18N}.col_note`)}</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {stages.map((stage) => {
            const block = blockOf(stage.id);
            const active = picked === stage.id;
            const cell = cn(PLAIN_TD, "flex h-10 min-w-0 items-center border-r-0", block && "text-placeholder");
            return (
              <button
                key={stage.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={Boolean(block)}
                onClick={() => setPicked(stage.id)}
                className={cn(
                  COLS,
                  "w-full text-left",
                  block ? "cursor-not-allowed" : active ? "bg-accent-subtle" : "hover:bg-layer-1"
                )}
              >
                <span className={cn(cell, "justify-center px-0")}>
                  <RadioDot checked={active} disabled={Boolean(block)} />
                </span>
                <span className={cn(cell, !block && "text-secondary", "tabular-nums")}>{stage.code}</span>
                <span className={cell} style={stage.depth ? { paddingLeft: 12 + stage.depth * 14 } : undefined}>
                  {stage.depth > 0 && <span className="mr-1.5 shrink-0 text-placeholder">└</span>}
                  <span className="truncate">{stage.name}</span>
                </span>
                <span className={cn(cell, !block && "text-secondary")}>
                  <span className="truncate">{stage.stage_type_name}</span>
                </span>
                <span className={cell}>
                  {block && t(`${I18N}.${block === "current" ? "tag_current" : "tag_conflict"}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="px-6 pt-3 pb-4 text-12 leading-relaxed text-tertiary">{t(`${I18N}.hint`)}</p>

      <TailoringModalFooter
        hint={
          excludedCount > 0 ? (
            <span className="text-warning-primary">{t(`${I18N}.excluded`, { count: excludedCount })}</span>
          ) : undefined
        }
      >
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          disabled={!target || cells.length === 0}
          onClick={() => {
            if (!target) return;
            onConfirm(target);
            onClose();
          }}
        >
          {t(`${I18N}.confirm_short`)}
        </Button>
      </TailoringModalFooter>
    </ModalCore>
  );
};
