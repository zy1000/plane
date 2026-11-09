import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueFieldLibraryItem, TIssueFieldLibraryPayload } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useIssueFieldLibrary } from "@/hooks/store/use-issue-field-library";
import { useTemplatePermissions } from "../permissions";
import { getIssueFieldErrorMessage } from "./helpers";
import { IssueFieldFormModal } from "./issue-field-form-modal";
import { IssueFieldLibraryContent } from "./issue-field-library-content";

/**
 * 模板中心「通用字段」：工作区级字段库。库字段的定义只在这里改，保存后后端同步到所有绑定它的类型。
 * 读要研发模式 view（页面路由已拦），新建 / 编辑 / 删除要研发模式 manage。
 */
export const IssueFieldLibraryPage = observer(function IssueFieldLibraryPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const { canManageDevModes: canManage } = useTemplatePermissions(workspaceSlug);
  const { fields, isLoading, hasLoaded, error, fetchFields, createField, updateField, deleteField } =
    useIssueFieldLibrary(workspaceSlug);
  // 关闭时保留 field，离场动画期间不闪成「新建字段」
  const [modal, setModal] = useState<{ isOpen: boolean; field: TIssueFieldLibraryItem | null }>({
    isOpen: false,
    field: null,
  });
  const [fieldToDelete, setFieldToDelete] = useState<TIssueFieldLibraryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSubmit = async (payload: TIssueFieldLibraryPayload) => {
    if (modal.field) {
      await updateField(modal.field.id, payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已保存" });
    } else {
      await createField(payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已创建" });
    }
  };

  const handleDelete = async () => {
    if (!fieldToDelete) return;
    setIsDeleting(true);
    try {
      await deleteField(fieldToDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已删除" });
      setFieldToDelete(null);
    } catch (deleteError) {
      // 仍有类型绑定时 409，提示后端给的原因
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: getIssueFieldErrorMessage(deleteError, "无法删除字段，请稍后重试。"),
      });
      setFieldToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <PageHead title={`通用字段库 - ${t("workspace_templates.title")}`} />
      <ContentWrapper className="bg-surface-1">
        <IssueFieldLibraryContent
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

      <IssueFieldFormModal
        fields={fields}
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
            确定要删除字段<span className="font-medium text-primary">「{fieldToDelete?.name}」</span>
            吗？此操作不可撤销。
          </>
        }
        primaryButtonText={{ default: "删除", loading: "删除中" }}
        secondaryButtonText="取消"
      />
    </>
  );
});
