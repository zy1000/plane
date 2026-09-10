import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { AlertCircle, ClipboardCheck, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TStageReviewTemplate } from "@plane/types";
import { EProductDictionaryKey, STAGE_REVIEW_ROOT_KINDS } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useStageReviewTemplates } from "@/hooks/store/use-stage-review-templates";
import { useTemplatePermissions } from "../permissions";
import { StageRail } from "./stage-rail";
import { StageReviewTemplateFormModal, type TStageReviewFormValue } from "./stage-review-template-form-modal";
import { StageReviewTemplateTable } from "./stage-review-template-table";

const I18N = "workspace_templates.reviews";

type TEditorState =
  | { mode: "closed" }
  | { mode: "create"; parent: TStageReviewTemplate | null }
  | { mode: "edit"; template: TStageReviewTemplate };

export const StageReviewTemplateList = observer(function StageReviewTemplateList({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const { canManageReviewTemplates } = useTemplatePermissions(workspaceSlug);
  // 阶段的唯一来源是数据字典 product_stage —— 还没配模板的阶段也要能选中并加第一条
  const { getDictionaryByKey, isLoading: isStagesLoading } = useDataDictionaries(workspaceSlug);
  const stageDictionary = getDictionaryByKey(EProductDictionaryKey.STAGE);
  const stages = useMemo(
    () => (stageDictionary?.items ?? []).map((item) => ({ id: item.id, label: item.label })),
    [stageDictionary]
  );

  const {
    groups,
    isLoading: isTemplatesLoading,
    isMutating,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    reorderTemplates,
  } = useStageReviewTemplates(workspaceSlug, stages);

  const isLoading = isTemplatesLoading || isStagesLoading;

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<TEditorState>({ mode: "closed" });
  const [templateToDelete, setTemplateToDelete] = useState<TStageReviewTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 选中项回落用派生而不是 effect：阶段被删/被筛掉时自动落到第一个
  const selectedGroup = groups.find((group) => group.stageId === selectedStageId) ?? groups[0] ?? null;

  // 默认展开全部根评审：66 行的库，折起来第一眼什么都看不到
  useEffect(() => {
    setExpandedIds((current) => {
      if (current.size > 0) return current;
      const next = new Set<string>();
      for (const group of groups) {
        for (const { node, children } of group.nodes) if (children.length > 0) next.add(node.id);
      }
      return next;
    });
  }, [groups]);

  const filteredGroup = useMemo(() => {
    if (!selectedGroup) return null;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return selectedGroup;
    const hit = (item: TStageReviewTemplate) =>
      [item.title, item.initiator_role, item.leader_role, item.auditor_role]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    // 命中子节点时保留它的父，否则树会断掉
    const nodes = selectedGroup.nodes
      .map(({ node, children }) => {
        const matchedChildren = children.filter(hit);
        if (hit(node)) return { node, children };
        if (matchedChildren.length > 0) return { node, children: matchedChildren };
        return null;
      })
      .filter((entry): entry is { node: TStageReviewTemplate; children: TStageReviewTemplate[] } => entry !== null);
    return { ...selectedGroup, nodes };
  }, [selectedGroup, search]);

  const toggleExpand = (templateId: string) =>
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });

  const handleSubmit = async (value: TStageReviewFormValue) => {
    if (editor.mode === "edit") {
      await updateTemplate(editor.template.id, value);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.updated`) });
    } else if (editor.mode === "create") {
      if (!selectedGroup) return;
      await createTemplate({ stage_id: selectedGroup.stageId, ...value });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.created`) });
    }
    setEditor({ mode: "closed" });
  };

  const handleToggleActive = async (template: TStageReviewTemplate) => {
    try {
      await updateTemplate(template.id, { is_active: !template.is_active });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.update_failed`) });
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setIsDeleting(true);
    try {
      await deleteTemplate(templateToDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.deleted`) });
      setTemplateToDelete(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.delete_failed`) });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReorder = (orderedIds: string[]) => {
    void reorderTemplates(orderedIds).catch(() =>
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.reorder_failed`) })
    );
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <Loader className="flex min-h-0 w-full flex-1 gap-4">
          <Loader.Item height="420px" width="248px" className="hidden md:block" />
          <Loader.Item height="420px" width="100%" className="flex-1" />
        </Loader>
      );
    }
    if (error) {
      return (
        <div className="flex h-full min-h-80 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
              <AlertCircle className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">{t(`${I18N}.error_title`)}</h2>
            <p className="mt-1 text-12 leading-5 text-secondary">{error}</p>
            <Button className="mt-4" variant="secondary" onClick={() => void fetchTemplates().catch(() => undefined)}>
              {t("retry")}
            </Button>
          </div>
        </div>
      );
    }
    if (groups.length === 0 || !selectedGroup || !filteredGroup) {
      return (
        <div className="flex h-full min-h-80 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <ClipboardCheck className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">{t(`${I18N}.empty.title`)}</h2>
            <p className="mt-1 text-12 leading-5 text-secondary">{t(`${I18N}.empty.description`)}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 md:flex-row">
        <div className="min-h-0 shrink-0 max-md:max-h-56 md:w-64">
          <StageRail groups={groups} selectedStageId={selectedGroup.stageId} onSelect={setSelectedStageId} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-16 font-semibold text-primary">{selectedGroup.stageLabel}</h2>
              <span className="text-12 text-tertiary">
                {t(`${I18N}.stage_summary`, {
                  reviews: selectedGroup.reviewCount,
                  activities: selectedGroup.activityCount,
                })}
              </span>
            </div>
          </div>
          <StageReviewTemplateTable
            group={filteredGroup}
            expandedIds={expandedIds}
            canEdit={canManageReviewTemplates && !search.trim()}
            onToggleExpand={toggleExpand}
            onEdit={(template) => setEditor({ mode: "edit", template })}
            onAddChild={(parent) => {
              // 加完要能立刻看见，父节点折着就先展开
              setExpandedIds((current) => new Set(current).add(parent.id));
              setEditor({ mode: "create", parent });
            }}
            onDelete={setTemplateToDelete}
            onToggleActive={(template) => void handleToggleActive(template)}
            onReorder={handleReorder}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHead title={`${t(`${I18N}.title`)} - ${t("workspace_templates.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t(`${I18N}.title`)}
                      icon={<ClipboardCheck className="size-4 text-secondary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t(`${I18N}.search_placeholder`)}
                  className="h-8 w-56 rounded-md border border-subtle bg-surface-1 pr-2.5 pl-8 text-12 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
                />
              </div>
              {canManageReviewTemplates && (
                <Button variant="primary" onClick={() => setEditor({ mode: "create", parent: null })}>
                  <Plus className="size-3.5" />
                  {t(`${I18N}.create`)}
                </Button>
              )}
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">{renderBody()}</ContentWrapper>

      <StageReviewTemplateFormModal
        isOpen={editor.mode !== "closed"}
        template={editor.mode === "edit" ? editor.template : null}
        defaultParent={editor.mode === "create" ? editor.parent : null}
        stageRoots={selectedGroup?.nodes.map(({ node }) => node) ?? []}
        stageLabel={selectedGroup?.stageLabel ?? ""}
        isSubmitting={isMutating}
        onClose={() => setEditor({ mode: "closed" })}
        onSubmit={handleSubmit}
      />

      <AlertModalCore
        isOpen={Boolean(templateToDelete)}
        handleClose={() => setTemplateToDelete(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        variant="danger"
        title={t(`${I18N}.delete_modal.title`)}
        content={
          templateToDelete && STAGE_REVIEW_ROOT_KINDS.includes(templateToDelete.kind)
            ? t(`${I18N}.delete_modal.content_review`, {
                title: templateToDelete.title,
                count: templateToDelete.child_count,
              })
            : t(`${I18N}.delete_modal.content_activity`, { title: templateToDelete?.title ?? "" })
        }
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
});
