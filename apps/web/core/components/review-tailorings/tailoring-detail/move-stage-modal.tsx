import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringItem, TReviewTailoringModeStage, TReviewTailoringProduct } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { TailoringModalHeader } from "./modal-header";

const I18N = "review_tailoring.move_stage";
/** 列：单选 / 编码 / 阶段 / 阶段类型 / 右侧标签 */
const COLS = "grid grid-cols-[1rem_3.5rem_minmax(0,1fr)_5.5rem_7rem] items-center gap-x-3 px-3.5";
/** 「当前」条里最多摆几个产品编号，多出来的写 +N */
const MAX_PRODUCT_CHIPS = 4;

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

  const productChips = useMemo(() => {
    const ids = [...new Set(cells.map((cell) => cell.product_id))];
    const byId = new Map(products.map((product) => [product.id, product]));
    const labels = ids.map((id) => byId.get(id)?.identifier || byId.get(id)?.name || "");
    return { shown: labels.slice(0, MAX_PRODUCT_CHIPS), more: Math.max(0, labels.length - MAX_PRODUCT_CHIPS) };
  }, [cells, products]);

  const target = stages.find((stage) => stage.id === picked);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <TailoringModalHeader
        icon={<ArrowLeftRight className="size-5" />}
        title={t(`${I18N}.title`)}
        subtitle={titles.length === 1 ? titles[0] : t(`${I18N}.subtitle_many`, { count: titles.length })}
        onClose={onClose}
      />

      <div className="mx-6 flex min-w-0 items-center gap-3 rounded-lg bg-layer-1 px-3.5 py-3 text-13 text-secondary">
        <span className="shrink-0 text-12 text-tertiary">{t(`${I18N}.current`)}</span>
        <span className="shrink-0 font-semibold text-primary">{currentStages.join("、")}</span>
        {parentTitle && (
          <span className="min-w-0 truncate">
            <span className="mr-2 text-placeholder">·</span>
            {t(`${I18N}.parent`, { title: parentTitle })}
          </span>
        )}
        <span className="ml-auto flex shrink-0 gap-1.5">
          {productChips.shown.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="inline-flex h-5.5 items-center rounded-md border border-subtle bg-surface-1 px-2 text-12 text-secondary tabular-nums"
            >
              {label}
            </span>
          ))}
          {productChips.more > 0 && (
            <span className="inline-flex h-5.5 items-center px-1 text-12 text-tertiary tabular-nums">
              +{productChips.more}
            </span>
          )}
        </span>
      </div>

      <div className="mx-6 mt-3.5 overflow-hidden rounded-lg border border-subtle" role="radiogroup">
        <div className={cn(COLS, "h-8.5 border-b border-subtle bg-layer-1 text-12 text-tertiary")}>
          <span />
          <span>{t(`${I18N}.col_code`)}</span>
          <span>{t(`${I18N}.col_stage`)}</span>
          <span>{t(`${I18N}.col_type`)}</span>
          <span />
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {stages.map((stage) => {
            const block = blockOf(stage.id);
            const active = picked === stage.id;
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
                  "h-11 w-full border-b border-subtle text-left text-14 last:border-b-0",
                  block
                    ? "cursor-not-allowed text-placeholder"
                    : active
                      ? "bg-accent-subtle"
                      : "hover:bg-layer-transparent-hover"
                )}
              >
                <span
                  className={cn(
                    "size-4 rounded-full border-[1.5px]",
                    block
                      ? "border-subtle bg-layer-3"
                      : active
                        ? "border-[5px] border-accent-strong bg-surface-1"
                        : "border-strong bg-surface-1"
                  )}
                />
                <span className={cn("font-mono text-12", block ? "text-placeholder" : "text-tertiary")}>
                  {stage.code}
                </span>
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 font-medium",
                    block ? "text-placeholder" : active ? "text-accent-primary" : "text-primary"
                  )}
                  style={stage.depth ? { paddingLeft: stage.depth * 14 } : undefined}
                >
                  {stage.depth > 0 && <span className="shrink-0 font-normal text-placeholder">└</span>}
                  <span className="truncate">{stage.name}</span>
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "inline-flex h-5 max-w-full items-center truncate rounded-[5px] bg-layer-3 px-1.5 text-12",
                      block ? "text-placeholder" : "text-secondary"
                    )}
                  >
                    {stage.stage_type_name}
                  </span>
                </span>
                <span className="justify-self-end">
                  {block && (
                    <span className="rounded border border-subtle px-1.5 text-11 text-placeholder">
                      {t(`${I18N}.${block === "current" ? "tag_current" : "tag_conflict"}`)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mx-6 mt-3 flex items-start gap-2 text-12 leading-relaxed text-tertiary">
        <Info className="mt-0.5 size-3.5 shrink-0 text-placeholder" />
        {t(`${I18N}.hint`)}
      </p>

      <div className="flex items-center gap-2.5 px-6 pt-4 pb-5">
        <span className="mr-auto min-w-0">
          {excludedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-12 font-medium text-warning-primary">
              <AlertTriangle className="size-3.5 shrink-0" />
              {t(`${I18N}.excluded`, { count: excludedCount })}
            </span>
          )}
        </span>
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
          {target
            ? t(`${I18N}.confirm_to`, { stage: target.name, count: cells.length })
            : t(`${I18N}.confirm`, { count: cells.length })}
        </Button>
      </div>
    </ModalCore>
  );
};
