import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TRequirementFieldLibraryDataLoss } from "@plane/types";
import { IssueTypeTag } from "@/components/project-issue-types/field-display";

type Props = {
  data: TRequirementFieldLibraryDataLoss;
  isSubmitting: boolean;
  /** 回到表单继续改，草稿不丢 */
  onBack: () => void;
  onConfirm: () => void;
};

/**
 * 保存通用字段会清掉已有字段值时的确认内容：一个通用字段可能被多个需求类型使用，
 * 这里按需求类型列出受影响的需求条数，一次确认。渲染在字段编辑弹窗里，替换表单。
 */
export function RequirementFieldImpactView({ data, isSubmitting, onBack, onConfirm }: Props) {
  return (
    <div role="alertdialog" aria-label="保存影响确认">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h2 className="text-18 font-semibold text-primary">保存影响确认</h2>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary disabled:opacity-40"
          onClick={onBack}
          disabled={isSubmitting}
          aria-label="返回修改"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-4 px-6 pb-6">
        <p className="text-13 leading-5 text-secondary">
          保存后，以下需求中受本次修改影响的字段值将被清除，清除后不可恢复。
        </p>
        <div className="overflow-hidden rounded-lg border border-subtle text-13">
          <div className="flex h-10 items-center justify-between bg-layer-1 px-4 text-secondary">
            <span>需求类型</span>
            <span>受影响需求</span>
          </div>
          {data.affected.map((item) => (
            <div
              key={item.requirement_type_id}
              className="flex h-12 items-center justify-between gap-4 border-t border-subtle px-4"
            >
              <IssueTypeTag name={item.name} icon={item.logo_props?.icon} className="min-w-0 shrink bg-transparent px-0" />
              <span className="shrink-0 text-primary tabular-nums">{item.affected_requirement_count} 条</span>
            </div>
          ))}
          <div className="flex h-12 items-center justify-between border-t border-subtle bg-layer-1 px-4 font-semibold text-primary">
            <span>合计</span>
            <span className="tabular-nums">{data.affected_requirement_count} 条</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-subtle px-6 py-4">
        <Button variant="secondary" size="lg" type="button" onClick={onBack} disabled={isSubmitting}>
          返回修改
        </Button>
        <Button variant="error-fill" size="lg" type="button" onClick={onConfirm} loading={isSubmitting}>
          确认保存
        </Button>
      </div>
    </div>
  );
}
