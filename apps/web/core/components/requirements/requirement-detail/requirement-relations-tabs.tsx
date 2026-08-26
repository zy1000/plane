/**
 * 整页的关联区：子需求 / 关联工作项 / 关联测试用例合成一张带计数的 Tab 卡片。
 *
 * 抽屉仍是竖排的折叠块（RequirementProductRelations）—— 抽屉窄、内容少，折叠块够用；
 * 整页宽、三块都可能很长，并排成 Tab 才不会把页面拉成一条竖井。三个面板常驻挂载、只切
 * 显示：关联 / 拆分弹窗挂在面板组件里，切走了也得能弹出来；数据也不必每次切回来重拉。
 * 拆分 / 关联的操作条放在 Tab 行右侧，项目落点规则与抽屉共用 useProductRelationActions。
 */
import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";
import { cn } from "@plane/utils";
import { RequirementSubRequirementList } from "./requirement-detail-content";
import { RequirementIssuesByProject } from "./requirement-issues-by-project";
import { RequirementIssuesSection } from "./requirement-issues-section";
import { useProductRelationActions } from "./requirement-product-relations";
import { RequirementRelationActionButtons } from "./requirement-relation-action-buttons";
import { RequirementTestCasesSection } from "./requirement-testcases-section";

type TTabKey = "sub_requirements" | "issues" | "test_cases";

type TProps = {
  workspaceSlug: string;
  productId: string;
  requirement: TRequirement;
  subRequirements: TRequirement[];
  canManage: boolean;
  onChanged?: () => void;
  onOpenRequirement: (requirementId: string) => void;
};

export const RequirementRelationsTabs = (props: TProps) => {
  const { workspaceSlug, productId, requirement, subRequirements, canManage, onChanged, onOpenRequirement } = props;
  const { t } = useTranslation();
  // 有子需求先看子需求，否则直接落到工作项 —— 都在回答「这条需求被拆成了什么」
  const [activeTab, setActiveTab] = useState<TTabKey>(subRequirements.length ? "sub_requirements" : "issues");
  // 工作项 / 用例的数量只有面板自己拉完才知道，null 表示还没到
  const [issueCount, setIssueCount] = useState<number | null>(null);
  const [testCaseCount, setTestCaseCount] = useState<number | null>(null);
  const actions = useProductRelationActions({ workspaceSlug, productId, requirement });

  const tabs: { key: TTabKey; label: string; count: number | null }[] = [
    { key: "sub_requirements", label: t("requirement_detail.sub_requirements"), count: subRequirements.length },
    { key: "issues", label: t("project_requirements.issues.section_title"), count: issueCount },
    { key: "test_cases", label: t("requirement_detail.test_cases.section_title"), count: testCaseCount },
  ];

  return (
    <>
      <div className="overflow-hidden rounded-md border border-subtle">
        <div className="flex items-center gap-1 border-b border-subtle px-1.5" role="tablist">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex h-10 items-center gap-1.5 px-2.5 text-body-xs-regular transition-colors",
                  isActive
                    ? "font-medium text-accent-primary after:absolute after:right-1.5 after:bottom-0 after:left-1.5 after:h-0.5 after:bg-accent-primary"
                    : "text-secondary hover:text-primary"
                )}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className="text-caption-md-regular text-tertiary tabular-nums">{tab.count}</span>
                )}
              </button>
            );
          })}
          {canManage && (
            <div className="ml-auto py-1.5 pr-1">
              <RequirementRelationActionButtons
                issueProjects={actions.issueProjects}
                onSplit={(projectId) => actions.beginIssueAction("split", projectId)}
                onLinkIssue={(projectId) => actions.beginIssueAction("link", projectId)}
                onLinkTestCase={() => actions.setIsLinkCaseOpen(true)}
              />
            </div>
          )}
        </div>

        <div role="tabpanel" className={cn(activeTab !== "sub_requirements" && "hidden")}>
          {subRequirements.length ? (
            <RequirementSubRequirementList items={subRequirements} framed={false} onOpen={onOpenRequirement} />
          ) : (
            <p className="px-3 py-3 text-body-xs-regular text-tertiary">
              {t("requirement_detail.sub_requirements_empty")}
            </p>
          )}
        </div>
        <div role="tabpanel" className={cn(activeTab !== "issues" && "hidden")}>
          <RequirementIssuesByProject
            workspaceSlug={workspaceSlug}
            requirement={requirement}
            canManage={canManage}
            onChanged={onChanged}
            variant="plain"
            onCountChange={setIssueCount}
          />
        </div>
        <div role="tabpanel" className={cn(activeTab !== "test_cases" && "hidden")}>
          <RequirementTestCasesSection
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirementId={requirement.id}
            canManage={canManage}
            variant="plain"
            linkModalOpen={actions.isLinkCaseOpen}
            onLinkModalOpenChange={actions.setIsLinkCaseOpen}
            onCountChange={setTestCaseCount}
          />
        </div>
      </div>

      {/* 只借它的拆分 / 关联弹窗，列表由上面的按项目面板承担 —— 与抽屉的关联区同一做法 */}
      {actions.actionProjectId && (
        <RequirementIssuesSection
          workspaceSlug={workspaceSlug}
          projectId={actions.actionProjectId}
          requirementId={requirement.id}
          requirement={requirement}
          canManage={canManage}
          onChanged={onChanged}
          hideList
          hideAddActions
          splitModalOpen={actions.isSplitOpen}
          onSplitModalOpenChange={actions.setIsSplitOpen}
          linkModalOpen={actions.isLinkIssueOpen}
          onLinkModalOpenChange={actions.setIsLinkIssueOpen}
        />
      )}
    </>
  );
};
