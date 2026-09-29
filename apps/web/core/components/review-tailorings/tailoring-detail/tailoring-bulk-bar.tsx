import { ArrowLeftRight, Check, MessageSquare, Scissors, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { BulkOperationsBar } from "@/components/common/bulk-operations-bar";

/**
 * 矩阵与明细勾选后浮在底部的批量操作条：保留 / 裁剪 / 填写原因 / 移到阶段 / 移除。
 *
 * 用的是列表页那条公共操作条（用例、阶段评审同款），只是动作换成裁剪表自己的几个。
 * 「填写原因」只对选中的裁剪项生效，全是保留项时按钮灰掉；「移除」只有矩阵给（按行移除）。
 */
export const TailoringBulkBar = ({
  count,
  selectedLabel,
  cutCount,
  selectAllLabel,
  onSelectAll,
  onClear,
  onKeep,
  onCut,
  onReason,
  onMove,
  onRemove,
}: {
  count: number;
  /** 「已选 3 行」/「已选 3 条」 */
  selectedLabel: string;
  /** 选中的里面有几条是裁剪 */
  cutCount: number;
  /** 还没全选时给：「选择全部 N 条」 */
  selectAllLabel?: string;
  onSelectAll?: () => void;
  onClear: () => void;
  onKeep: () => void;
  onCut: () => void;
  onReason: () => void;
  /** 选中的里面有评审活动才给 */
  onMove?: () => void;
  onRemove?: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <BulkOperationsBar
      // 公共条默认贴在分页行上方，这里的宿主是整片内容区，改成浮在底部
      className="inset-x-0 top-auto bottom-3 z-[6] pb-0"
      selectedCount={count}
      selectedLabel={selectedLabel}
      onClearSelection={onClear}
    >
      {selectAllLabel && onSelectAll && (
        <>
          <Button variant="link" size="lg" className="px-1 no-underline" onClick={onSelectAll}>
            {selectAllLabel}
          </Button>
          <span className="mx-0.5 h-4 border-l border-subtle" aria-hidden />
        </>
      )}
      <Button variant="ghost" size="lg" prependIcon={<Check />} onClick={onKeep}>
        {t("review_tailoring.matrix.keep")}
      </Button>
      <Button variant="ghost" size="lg" prependIcon={<Scissors />} onClick={onCut}>
        {t("review_tailoring.matrix.cut")}
      </Button>
      <Button
        variant="ghost"
        size="lg"
        className="text-accent-primary"
        prependIcon={<MessageSquare />}
        disabled={cutCount === 0}
        onClick={onReason}
      >
        {t("review_tailoring.items.bulk_reason")}
      </Button>
      {onMove && (
        <Button variant="ghost" size="lg" prependIcon={<ArrowLeftRight />} onClick={onMove}>
          {t("review_tailoring.move_stage.bulk")}
        </Button>
      )}
      {onRemove && (
        <>
          <span className="mx-0.5 h-4 border-l border-subtle" aria-hidden />
          <Button variant="ghost" size="lg" className="text-danger-primary" prependIcon={<Trash2 />} onClick={onRemove}>
            {t("remove")}
          </Button>
        </>
      )}
    </BulkOperationsBar>
  );
};
