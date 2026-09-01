/**
 * 需求详情的关联区：整页与抽屉同一套 —— 顶上一条快捷操作条（拆分 / 关联工作项 /
 * 关联用例 / 上传附件），下面只渲染有内容的折叠块（子需求 / 工作项 / 用例 / 附件）。
 * 空的不占位，也不先甩「请先关联到项目」；入口全在操作条上，与工作项详情同一读法。
 *
 * 工作项 / 用例按侧别分两种落点：产品侧拆分 / 关联要先选项目（RequirementIssue 挂在
 * (需求, 项目) 下 —— 需求进了多个项目时按钮展开菜单，还没进项目则提示先关联）；项目侧
 * 语境已定，直接开弹窗。用例关联是需求级的，两侧都不需要项目。
 *
 * 子需求与附件两侧都有；库条目、范围抽屉、个人页不传 relations，就只剩这两块。
 */
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementAssetRef } from "@plane/types";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { RequirementAttachmentsSection } from "./requirement-attachments-section";
import { RequirementIssuesByProject } from "./requirement-issues-by-project";
import { RequirementIssuesSection } from "./requirement-issues-section";
import { RequirementRelationActionButtons } from "./requirement-relation-action-buttons";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";
import { RequirementSubRequirementList } from "./requirement-sub-requirement-list";
import { RequirementTestCasesSection } from "./requirement-testcases-section";
import { useRequirementAttachmentUploads } from "./use-requirement-attachment-uploads";

export type TRequirementRelationsConfig = {
  /** 页面级写权限。关联不是内容、不走评审，所以不跟正文的 readOnly */
  canManage: boolean;
  /** 关联 / 解除会改行上的工作项数与完成率，让调用方重拉这一行 */
  onChanged?: () => void;
  /**
   * 项目侧传本项目 id：拆分 / 关联直接落到本项目，用例候选池收窄到本项目库 + 共享库。
   * 不传（产品侧）则拆分 / 关联先选项目。
   */
  projectId?: string;
  /** 项目侧拆分时预填迭代（恰好一个未取消迭代时）；这个注解只有项目行上有 */
  linkedCycleIds?: string[];
};

type TProps = {
  workspaceSlug: string;
  /** 资产的归属方：产品或标准库的 id */
  entityId: string;
  entityKind: "product" | "library";
  requirement: TRequirement;
  subRequirements: TRequirement[];
  /** 传了才有工作项 / 用例；库条目、范围抽屉、个人页不传 */
  relations?: TRequirementRelationsConfig;
  /** 正文的内容可编辑性：附件算内容，上传 / 删除跟它走 */
  readOnly: boolean;
  onAttachmentsChange: (updater: (current: TRequirementAssetRef[]) => TRequirementAssetRef[]) => void;
  onOpenRequirement: (requirementId: string) => void;
};

/**
 * 拆分 / 关联工作项 / 关联用例三个动作的项目落点与弹窗开关。
 *
 * 产品侧要先定项目：需求只进了一个项目就直接开弹窗，进了多个先选，还没进则提示先关联；
 * 项目侧 projectId 已定，直接开。
 */
const useRelationActions = ({
  workspaceSlug,
  productId,
  requirement,
  projectId,
}: {
  workspaceSlug: string;
  productId?: string;
  requirement: TRequirement;
  projectId?: string;
}) => {
  const { t } = useTranslation();
  // 项目侧落点已定，不需要产品↔项目关联表；传 undefined 让 hook 不发请求
  const { links } = useProductProjects({ workspaceSlug, productId: projectId ? undefined : productId });
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [isLinkIssueOpen, setIsLinkIssueOpen] = useState(false);
  const [isLinkCaseOpen, setIsLinkCaseOpen] = useState(false);

  /** 产品侧的候选项目；项目侧 undefined，操作条按钮直接回调 */
  const issueProjects = useMemo(() => {
    if (projectId) return undefined;
    const nameById = new Map(
      links.map((link) => [link.project, link.project_detail?.name ?? t("project_requirements.hidden_project")])
    );
    return (requirement.project_ids ?? []).map((id) => ({
      id,
      name: nameById.get(id) ?? t("project_requirements.hidden_project"),
    }));
  }, [links, projectId, requirement.project_ids, t]);

  const beginIssueAction = (kind: "split" | "link", picked?: string) => {
    const resolved = projectId ?? picked ?? (issueProjects?.length === 1 ? issueProjects[0].id : undefined);
    if (!resolved) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_requirements.issues.link_project_first"),
      });
      return;
    }
    setPickedProjectId(resolved);
    if (kind === "split") setIsSplitOpen(true);
    else setIsLinkIssueOpen(true);
  };

  return {
    issueProjects,
    /** 拆分 / 关联弹窗要落到的项目：项目侧固定，产品侧是上次选中的 */
    actionProjectId: projectId ?? pickedProjectId,
    isSplitOpen,
    setIsSplitOpen,
    isLinkIssueOpen,
    setIsLinkIssueOpen,
    isLinkCaseOpen,
    setIsLinkCaseOpen,
    beginIssueAction,
  };
};

export const RequirementRelationsArea = observer(function RequirementRelationsArea(props: TProps) {
  const {
    workspaceSlug,
    entityId,
    entityKind,
    requirement,
    subRequirements,
    relations,
    readOnly,
    onAttachmentsChange,
    onOpenRequirement,
  } = props;
  const { t } = useTranslation();
  const isLibrary = entityKind === "library";
  // 工作项 / 用例的端点都落在产品作用域；库条目没有产品，也就没有这两块
  const productId = isLibrary ? undefined : entityId;
  const canManage = Boolean(relations && productId && relations.canManage);

  const uploads = useRequirementAttachmentUploads({ workspaceSlug, entityId, onChange: onAttachmentsChange });
  const actions = useRelationActions({ workspaceSlug, productId, requirement, projectId: relations?.projectId });
  /** 拆分弹窗的预填来源：内容来自这一行，迭代只有项目侧能给 */
  const splitSeed = useMemo(
    () => ({ ...requirement, linked_cycle_ids: relations?.linkedCycleIds }),
    [relations?.linkedCycleIds, requirement]
  );

  return (
    <div className="flex flex-col gap-4">
      <RequirementRelationActionButtons
        issueProjects={actions.issueProjects}
        onSplit={canManage ? (pickedId) => actions.beginIssueAction("split", pickedId) : undefined}
        onLinkIssue={canManage ? (pickedId) => actions.beginIssueAction("link", pickedId) : undefined}
        onLinkTestCase={canManage ? () => actions.setIsLinkCaseOpen(true) : undefined}
        attachmentUploads={readOnly ? undefined : uploads}
      />

      {subRequirements.length > 0 && (
        <RequirementRelationCollapsible title={t("requirement_detail.sub_requirements")} count={subRequirements.length}>
          <div className="pb-3">
            <RequirementSubRequirementList
              items={subRequirements}
              isLibrary={isLibrary}
              framed={false}
              onOpen={onOpenRequirement}
            />
          </div>
        </RequirementRelationCollapsible>
      )}

      {/* 关联工作项与子需求并列 —— 都在回答「这条需求现在被拆成了什么」 */}
      {relations &&
        productId &&
        (relations.projectId ? (
          <RequirementIssuesSection
            workspaceSlug={workspaceSlug}
            projectId={relations.projectId}
            requirementId={requirement.id}
            requirement={splitSeed}
            canManage={relations.canManage}
            onChanged={relations.onChanged}
            hideWhenEmpty
            splitModalOpen={actions.isSplitOpen}
            onSplitModalOpenChange={actions.setIsSplitOpen}
            linkModalOpen={actions.isLinkIssueOpen}
            onLinkModalOpenChange={actions.setIsLinkIssueOpen}
          />
        ) : (
          <>
            <RequirementIssuesByProject
              workspaceSlug={workspaceSlug}
              requirement={requirement}
              canManage={relations.canManage}
              onChanged={relations.onChanged}
            />
            {/* 产品侧列表已按项目分组画过了，这里只挂拆分 / 关联弹窗，落到选中的项目 */}
            {actions.actionProjectId && (
              <RequirementIssuesSection
                workspaceSlug={workspaceSlug}
                projectId={actions.actionProjectId}
                requirementId={requirement.id}
                requirement={splitSeed}
                canManage={relations.canManage}
                onChanged={relations.onChanged}
                hideList
                splitModalOpen={actions.isSplitOpen}
                onSplitModalOpenChange={actions.setIsSplitOpen}
                linkModalOpen={actions.isLinkIssueOpen}
                onLinkModalOpenChange={actions.setIsLinkIssueOpen}
              />
            )}
          </>
        ))}

      {/* 关联测试用例紧跟其后 —— 回答「这条需求怎么验」，和「被拆成什么」是一组 */}
      {relations && productId && (
        <RequirementTestCasesSection
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirementId={requirement.id}
          canManage={relations.canManage}
          scopeProjectId={relations.projectId}
          hideWhenEmpty
          linkModalOpen={actions.isLinkCaseOpen}
          onLinkModalOpenChange={actions.setIsLinkCaseOpen}
        />
      )}

      {/* 需求级附件：产品需求与库条目都有。附件算内容（走 onPatch 进版本快照与评审） */}
      <RequirementAttachmentsSection
        workspaceSlug={workspaceSlug}
        entityId={entityId}
        entityKind={entityKind}
        requirementId={requirement.id}
        attachments={requirement.attachments ?? []}
        readOnly={readOnly}
        onChange={onAttachmentsChange}
        uploads={uploads}
      />
    </div>
  );
});
