import { useEffect, useMemo, useState } from "react";
import { E_SORT_ORDER } from "@plane/constants";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { ActivityOperatorFilterRoot } from "@/components/issues/issue-detail/issue-activity/operator-filter-root";
import { ActivitySortRoot } from "@/components/issues/issue-detail/issue-activity/sort-root";
import { useRequirementComments } from "@/hooks/store/use-requirement-comments";
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { TRequirementChange, TRequirementType, TRequirementVersion } from "@/services/requirement.service";
import { RequirementActivityFeed } from "./requirement-activity-feed";
import {
  buildRequirementActivityItems,
  sortRequirementActivityItems,
  type TRequirementActivityItem,
} from "./requirement-activity-utils";
import { RequirementCommentComposer, RequirementCommentsSection } from "./requirement-comments-section";

type TActivityTab = "all" | "version" | "review" | "comment";

const TABS: { key: TActivityTab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "version", label: "版本记录" },
  { key: "review", label: "评审记录" },
  { key: "comment", label: "评论" },
];

type Props = {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  requirementType: TRequirementType;
  changes: TRequirementChange[];
  versions: TRequirementVersion[];
  onOpenReview: (changeId: string) => void;
};

export function RequirementActivity(props: Props) {
  const { workspaceSlug, productId, requirementId, requirementType, changes, versions, onOpenReview } = props;
  const [activeTab, setActiveTab] = useState<TActivityTab>("all");
  const [sortOrder, setSortOrder] = useState<E_SORT_ORDER>(E_SORT_ORDER.ASC);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { comments, isLoading, fetchComments, createComment, removeComment } = useRequirementComments(
    workspaceSlug,
    productId,
    requirementId,
    requirementType
  );

  useEffect(() => {
    void fetchComments().catch(() => undefined);
  }, [fetchComments]);

  useEffect(() => {
    setActiveTab("all");
    setSelectedOperatorIds([]);
  }, [requirementId]);

  const allItems = useMemo(
    () => buildRequirementActivityItems(changes, versions, comments),
    [changes, comments, versions]
  );
  const operatorIds = useMemo(
    () => Array.from(new Set(allItems.map((item) => item.actor).filter((actor): actor is string => Boolean(actor)))),
    [allItems]
  );
  const feedItems = useMemo(() => {
    const operatorSet = new Set(selectedOperatorIds);
    const filtered = allItems.filter((item) => {
      if (activeTab !== "all" && activeTab !== "comment" && item.activityType !== activeTab) return false;
      if (operatorSet.size > 0 && !operatorSet.has(item.actor ?? "")) return false;
      return true;
    });
    return sortRequirementActivityItems(filtered, sortOrder === E_SORT_ORDER.ASC ? "asc" : "desc");
  }, [activeTab, allItems, selectedOperatorIds, sortOrder]);

  const emptyLabel =
    activeTab === "version" ? "暂无版本记录" : activeTab === "review" ? "暂无评审记录" : "暂无活动记录";

  return (
    <section className="pt-2 pb-4" aria-label="需求活动">
      <div className="border-b border-subtle">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1" role="tablist" aria-label="需求活动筛选">
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`requirement-activity-panel-${tab.key}`}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "relative mb-1 rounded-md px-3 py-1.5 text-body-xs-medium transition-colors outline-none",
                    "after:absolute after:right-0 after:-bottom-[5px] after:left-0 after:h-0.5 after:rounded-full after:transition-colors",
                    isActive
                      ? "bg-layer-1-active text-primary after:bg-[var(--txt-primary)]"
                      : "text-secondary after:bg-transparent hover:bg-surface-2/60 hover:text-primary"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          {activeTab !== "comment" && (
            <div className="flex shrink-0 items-center gap-2 pb-1">
              <ActivityOperatorFilterRoot
                operatorIds={operatorIds}
                selectedOperatorIds={selectedOperatorIds}
                onChange={setSelectedOperatorIds}
              />
              <ActivitySortRoot
                sortOrder={sortOrder}
                toggleSort={() =>
                  setSortOrder((current) => (current === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC))
                }
              />
            </div>
          )}
        </div>
      </div>

      <div id={`requirement-activity-panel-${activeTab}`} role="tabpanel" className="min-h-52">
        {activeTab === "comment" ? (
          <RequirementCommentsSection
            comments={comments}
            isLoading={isLoading}
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            productId={productId}
            requirementId={requirementId}
            onCreate={createComment}
            onRemove={removeComment}
          />
        ) : (
          <div className="space-y-4 pt-3">
            {isLoading && feedItems.length === 0 ? (
              <Loader className="space-y-3">
                <Loader.Item height="40px" />
                <Loader.Item height="40px" />
                <Loader.Item height="40px" />
              </Loader>
            ) : feedItems.length === 0 ? (
              <div className="grid min-h-40 place-items-center text-body-sm-regular text-placeholder">
                {selectedOperatorIds.length > 0 ? "暂无匹配操作人员的记录" : emptyLabel}
              </div>
            ) : (
              <RequirementActivityFeed
                items={feedItems as TRequirementActivityItem[]}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                onOpenReview={onOpenReview}
              />
            )}
            {activeTab === "all" && (
              <div className="border-t border-subtle pt-3">
                <RequirementCommentComposer
                  workspaceSlug={workspaceSlug}
                  workspaceId={workspaceId}
                  productId={productId}
                  requirementId={requirementId}
                  onCreate={createComment}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
