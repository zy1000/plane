import { useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import type { TUserRequirementListItem } from "@/services/requirement.service";

type Props = {
  requirement: TUserRequirementListItem | null;
  onClose: () => void;
  onDelete: (requirementId: string) => Promise<void>;
};

export function DeleteRequirementModal(props: Props) {
  const { onClose, onDelete, requirement } = props;
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!requirement) return;
    setIsDeleting(true);
    try {
      await onDelete(requirement.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "删除成功", message: "需求及其全部后代需求已删除。" });
      onClose();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: error?.error ?? "请稍后重试。" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={!!requirement}
      handleClose={onClose}
      handleSubmit={handleDelete}
      isSubmitting={isDeleting}
      title="删除用户需求"
      content={
        <span>
          确定删除“{requirement?.name}
          ”吗？该需求的全部子孙需求（包括可能关联的研发需求）和附件也会一并删除，且无法恢复。
        </span>
      }
    />
  );
}
