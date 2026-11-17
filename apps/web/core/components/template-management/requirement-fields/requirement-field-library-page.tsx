import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementFieldDefinition, TRequirementFieldDefinitionPayload } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementFieldLibrary } from "@/hooks/store/use-requirement-field-library";
import { useTemplatePermissions } from "../permissions";
import { RequirementFieldFormModal } from "./requirement-field-form-modal";
import { RequirementFieldLibraryContent } from "./requirement-field-library-content";

/**
 * 模板中心「需求通用字段库」：工作区级字段库。字段定义只在这里改，保存后后端同步到所有
 * 绑定它的需求类型。读 = 工作区成员（路由页已拦），新建 / 编辑 / 删除要需求类型管理权限。
 *
 * 地址带 ?field=<id> 时进页面直接打开该字段的编辑弹窗（需求类型配置页的「编辑通用字段」跳过来）。
 */
export const RequirementFieldLibraryPage = observer(function RequirementFieldLibraryPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const { canManageRequirementTypes: canManage } = useTemplatePermissions(workspaceSlug);
  const { fields, isLoading, hasLoaded, error, fetchFields, createField, updateField, deleteField } =
    useRequirementFieldLibrary(workspaceSlug);
  const [searchParams, setSearchParams] = useSearchParams();
  // 关闭时保留 field，离场动画期间不闪成「新建通用字段」
  const [modal, setModal] = useState<{ isOpen: boolean; field: TRequirementFieldDefinition | null }>({
    isOpen: false,
    field: null,
  });
  const [fieldToDelete, setFieldToDelete] = useState<TRequirementFieldDefinition | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const targetFieldId = searchParams.get("field");
  useEffect(() => {
    if (!targetFieldId || !hasLoaded) return;
    const target = fields.find((field) => field.id === targetFieldId);
    if (target && canManage) setModal({ isOpen: true, field: target });
    // 用过就摘掉：刷新或关弹窗后不再自动打开
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("field");
        return next;
      },
      { replace: true }
    );
    // 只在字段库拉回来的那一刻消费一次；fields 之后的增删改不该重新触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFieldId, hasLoaded]);

  const handleSubmit = async (payload: TRequirementFieldDefinitionPayload) => {
    if (modal.field) {
      await updateField(modal.field.id, payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已保存" });
    } else {
      await createField(payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已创建" });
    }
    setModal((current) => ({ ...current, isOpen: false }));
  };

  const handleDelete = async () => {
    if (!fieldToDelete) return;
    setIsDeleting(true);
    try {
      await deleteField(fieldToDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已删除" });
    } catch (deleteError) {
      // 仍有需求类型在用时 409，提示后端给的原因；顺手把使用情况拉回来
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: (deleteError as { error?: string })?.error ?? "无法删除字段，请稍后重试。",
      });
      void fetchFields().catch(() => undefined);
    } finally {
      setIsDeleting(false);
      setFieldToDelete(null);
    }
  };

  return (
    <>
      <PageHead title={`需求通用字段库 - ${t("workspace_templates.title")}`} />
      <ContentWrapper className="bg-surface-1">
        <RequirementFieldLibraryContent
          fields={fields}
          isLoading={isLoading}
          hasLoaded={hasLoaded}
          error={error}
          canManage={canManage}
          onCreate={() => setModal({ isOpen: true, field: null })}
          onEdit={(field) => setModal({ isOpen: true, field })}
          onDelete={setFieldToDelete}
          onRetry={() => void fetchFields().catch(() => undefined)}
        />
      </ContentWrapper>

      <RequirementFieldFormModal
        isOpen={modal.isOpen}
        field={modal.field}
        onClose={() => setModal((current) => ({ ...current, isOpen: false }))}
        onSubmit={handleSubmit}
      />

      <AlertModalCore
        isOpen={Boolean(fieldToDelete)}
        handleClose={() => !isDeleting && setFieldToDelete(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        variant="danger"
        title="删除字段"
        content={
          <>
            确定要删除通用字段<span className="font-medium text-primary">「{fieldToDelete?.name}」</span>
            吗？此操作不可撤销。
          </>
        }
        primaryButtonText={{ default: "删除", loading: "删除中" }}
        secondaryButtonText="取消"
      />
    </>
  );
});
