import { observer } from "mobx-react";
import type { TReviewTailoringApprovalAction } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import type { TReviewTailoringDetailStore } from "@/hooks/store/use-review-tailoring-detail";
import { ReviewTailoringApprovalPane } from "./approval-pane";

/** 详情页头「签批 / 签批详情」打开的弹窗：只签当前这张，直接用页面已有的 store，不重复拉 */
export const ReviewTailoringApprovalModal = observer(function ReviewTailoringApprovalModal({
  isOpen,
  workspaceSlug,
  projectId,
  store,
  onClose,
  onDone,
}: {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  store: TReviewTailoringDetailStore;
  onClose: () => void;
  onDone: (result: TReviewTailoringApprovalAction | "withdrawn") => void;
}) {
  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <div className="flex max-h-[85vh] flex-col">
        <ReviewTailoringApprovalPane
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          store={store}
          onClose={onClose}
          onDone={onDone}
        />
      </div>
    </ModalCore>
  );
});
