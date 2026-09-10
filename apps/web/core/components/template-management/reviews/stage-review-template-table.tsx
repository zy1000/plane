import { Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewTemplate } from "@plane/types";
import { STAGE_REVIEW_ROOT_KINDS } from "@plane/types";
import { Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TStageReviewGroup } from "@/hooks/store/use-stage-review-templates";
import { REVIEW_ROW_GRID } from "./stage-review-grid";
import { StageReviewTemplateRow } from "./stage-review-template-row";

type Props = {
  group: TStageReviewGroup;
  expandedIds: Set<string>;
  canEdit: boolean;
  onToggleExpand: (templateId: string) => void;
  onEdit: (template: TStageReviewTemplate) => void;
  onAddChild: (template: TStageReviewTemplate) => void;
  onDelete: (template: TStageReviewTemplate) => void;
  onToggleActive: (template: TStageReviewTemplate) => void;
  onReorder: (orderedIds: string[]) => void;
};

const I18N = "workspace_templates.reviews";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (item: TStageReviewTemplate) => item.id;

export function StageReviewTemplateTable(props: Props) {
  const { group, expandedIds, canEdit, onToggleExpand, onEdit, onAddChild, onDelete, onToggleActive, onReorder } =
    props;
  const { t } = useTranslation();

  // 这个阶段没有汇总评审：活动本身就是顶层项，值得说一句，否则看着像漏配了
  const hasRootReview =
    group.nodes.length === 0 || group.nodes.some(({ node }) => STAGE_REVIEW_ROOT_KINDS.includes(node.kind));
  const topLevel = group.nodes.map(({ node }) => node);

  const renderTop = (node: TStageReviewTemplate) => {
    const entry = group.nodes.find((item) => item.node.id === node.id);
    const children = entry?.children ?? [];
    const isExpanded = expandedIds.has(node.id);
    return (
      <div key={node.id}>
        <StageReviewTemplateRow
          template={node}
          childCount={children.length}
          isExpanded={isExpanded}
          isChild={false}
          canEdit={canEdit}
          canDrag={canEdit}
          onToggleExpand={() => onToggleExpand(node.id)}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />
        {isExpanded && children.length > 0 && (
          <Sortable
            id={`stage-review-children-${node.id}`}
            data={children}
            keyExtractor={keyExtractor}
            onChange={(next) => onReorder(next.map((item) => item.id))}
            render={(child: TStageReviewTemplate) => (
              <StageReviewTemplateRow
                template={child}
                childCount={0}
                isExpanded={false}
                isChild
                canEdit={canEdit}
                canDrag={canEdit}
                onToggleExpand={() => undefined}
                onEdit={onEdit}
                onAddChild={onAddChild}
                onDelete={onDelete}
                onToggleActive={onToggleActive}
              />
            )}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1">
      {!hasRootReview && (
        <div className="flex items-center gap-2 border-b border-subtle bg-layer-1 px-3 py-2 text-12 text-tertiary">
          <Info className="size-3.5 shrink-0" />
          {t(`${I18N}.rootless_hint`)}
        </div>
      )}

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-auto">
        <div role="table" className="flex min-w-[860px] flex-col">
          <div
            role="row"
            className={cn(
              REVIEW_ROW_GRID,
              "sticky top-0 z-10 h-9 border-b border-subtle bg-layer-1 text-11 font-medium text-tertiary"
            )}
          >
            <span>{t(`${I18N}.table.title`)}</span>
            <span>{t(`${I18N}.table.kind`)}</span>
            <span>{t(`${I18N}.table.initiator`)}</span>
            <span>{t(`${I18N}.table.leader`)}</span>
            <span>{t(`${I18N}.table.auditor`)}</span>
            <span>{t(`${I18N}.table.active`)}</span>
            <span />
          </div>

          {topLevel.length === 0 ? (
            <p className="px-3 py-10 text-center text-12 text-placeholder">
              {t(`${I18N}.table.empty`)}
            </p>
          ) : canEdit ? (
            <Sortable
              id={`stage-review-top-${group.stageId}`}
              data={topLevel}
              keyExtractor={keyExtractor}
              onChange={(next) => onReorder(next.map((item) => item.id))}
              render={renderTop}
            />
          ) : (
            topLevel.map(renderTop)
          )}
        </div>
      </div>
    </div>
  );
}
