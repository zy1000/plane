"use client";

import React from "react";
import { observer } from "mobx-react";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import type { TIssue } from "@plane/types";
import { BugIssueFormRoot } from "./bug-form";
import { IssueModalProvider } from "@/plane-web/components/issues/issue-modal";

export interface BugIssueModalProps {
  data?: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (res: TIssue) => Promise<void>;
  isDraft?: boolean;
  modalTitle?: string;
  primaryButtonText?: { default: string; loading: string };
  isProjectSelectionDisabled?: boolean;
  templateId?: string;
  allowedProjectIds?: string[];
  initialDescriptionHtml?: string;
}

export const BugIssueModal: React.FC<BugIssueModalProps> = observer((props) => {
  const {
    data,
    isOpen,
    onClose,
    onSubmit,
    isDraft = false,
    modalTitle,
    primaryButtonText,
    isProjectSelectionDisabled,
    templateId,
    allowedProjectIds,
    initialDescriptionHtml,
  } = props;

  if (!isOpen) return null;

  return (
    <IssueModalProvider templateId={templateId} dataForPreload={data} allowedProjectIds={allowedProjectIds}>
      <ModalCore
        isOpen={isOpen}
        position={EModalPosition.CENTER}
        width={EModalWidth.VIIXL}
        className="!bg-transparent rounded-lg shadow-none !h-[95vh] !max-h-none flex flex-col"
      >
        <BugIssueFormRoot
          issueTitleRef={React.createRef<HTMLInputElement>()}
          data={data}
          onAssetUpload={() => {}}
          onClose={onClose}
          onSubmit={async (payload) => {
            if (onSubmit) {
              const res = payload as any as TIssue;
              await onSubmit(res);
            }
          }}
          projectId={(data?.project_id as string) || ""}
          isDraft={isDraft}
          moveToIssue={false}
          modalTitle={modalTitle}
          primaryButtonText={primaryButtonText}
          isDuplicateModalOpen={false}
          handleDuplicateIssueModal={() => {}}
          isProjectSelectionDisabled={isProjectSelectionDisabled}
          initialDescriptionHtml={initialDescriptionHtml}
        />
      </ModalCore>
    </IssueModalProvider>
  );
});
