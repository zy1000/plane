import { ArrowLeftRight, Check, MessageSquare, Scissors } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { BulkOperationsBar } from "@/components/common/bulk-operations-bar";

/**
 * 裁剪明细勾选后浮在底部的批量操作条：保留 / 裁剪 / 填写原因 / 移到阶段。
 *
 * 用的是列表页那条公共操作条（用例、阶段评审同款），只是动作换成裁剪表自己的三个。
 * 「填写原因」只对选中的裁剪项生效，全是保留项时按钮灰掉。
 */
export const ItemsBulkBar = ({
  count,
  total,
  cutCount,
  onSelectAll,
  onClear,
  onKeep,
  onCut,
  onReason,
  onMove,
}: {
  count: number;
  /** 当前筛选下一共几行：全选完就不必再显示「选择全部」 */
  total: number;
  /** 选中的行里有几条是裁剪 */
  cutCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onKeep: () => void;
  onCut: () => void;
  onReason: () => void;
  /** 选中的行里有评审活动才给 */
  onMove?: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <BulkOperationsBar
      // 公共条默认贴在分页行上方，这里的宿主是整片内容区，改成浮在底部
      className="inset-x-0 top-auto bottom-5 z-[6] pb-0"
      selectedCount={count}
      selectedLabel={t("review_tailoring.items.selected_count", { count })}
      onClearSelection={onClear}
    >
      {count < total && (
        <Button variant="link" size="lg" className="px-1 no-underline" onClick={onSelectAll}>
          {t("review_tailoring.items.select_all_count", { count: total })}
        </Button>
      )}
      <span className="mx-0.5 h-4 border-l border-subtle" aria-hidden />
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
    </BulkOperationsBar>
  );
};
