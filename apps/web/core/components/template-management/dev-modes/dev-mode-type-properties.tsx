import { useMemo, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { getApiErrorMessage, IssueTypeFieldList } from "@/components/project-issue-types/root";
import type { useProjectIssueTypeFields } from "@/hooks/store/use-project-issue-type-fields";
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";

type TFieldsStore = ReturnType<typeof useProjectIssueTypeFields>;

/**
 * 类型详情的「属性」：与项目设置「工作项类型」展开后的属性区同一个列表（IssueTypeFieldList），底色也一样，
 * 一行一个属性，编辑与新建就地展开表单。
 */
export function DevModeTypeProperties({
  issueTypeId,
  fieldsStore,
  canEdit,
}: {
  issueTypeId: string;
  fieldsStore: TFieldsStore;
  canEdit: boolean;
}) {
  const { fields, isLoading, createField, updateField, deleteField } = fieldsStore;
  const [pendingDelete, setPendingDelete] = useState<TTypeExtraField | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeFields = useMemo(
    () => (fields ?? []).filter((field) => field.issue_type_id === issueTypeId),
    [fields, issueTypeId]
  );

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteField(pendingDelete.id);
      setPendingDelete(null);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: getApiErrorMessage(error, "无法删除自定义属性，请稍后重试。"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-lg bg-layer-1-hover">
      <IssueTypeFieldList
        issueTypeId={issueTypeId}
        fields={typeFields}
        isLoading={isLoading}
        canEdit={canEdit}
        hideTitle
        onCreate={createField}
        onUpdate={updateField}
        onRequestDelete={(field) => canEdit && setPendingDelete(field)}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        variant="danger"
        isSubmitting={isDeleting}
        title="删除自定义属性"
        primaryButtonText={{ loading: "删除中", default: "删除" }}
        secondaryButtonText="取消"
        content={
          <>
            确定要删除自定义属性<span className="font-medium text-primary">「{pendingDelete?.name}」</span>
            吗？此操作不可撤销。
          </>
        }
        handleClose={() => !isDeleting && setPendingDelete(null)}
        handleSubmit={() => void handleDelete()}
      />
    </div>
  );
}
