import { useState } from "react";
import { observer } from "mobx-react";
import { Expand, Shrink } from "lucide-react";
import { CloseIcon } from "@plane/propel/icons";
import { ModalPortal, EPortalWidth, EPortalPosition } from "@plane/propel/portal";
import type { IProject } from "@plane/types";
import { DefectOverview } from "./defect-overview";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  projectDetails?: IProject | undefined;
};

/**
 * 缺陷专用分析侧边弹窗（自共享 WorkItemsModal fork）。
 * 仅展示缺陷「概览」内容（DefectOverview），并比共享弹窗更宽以容纳概览。
 */
export const DefectAnalysisModal = observer(function DefectAnalysisModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, projectDetails } = props;
  const [fullScreen, setFullScreen] = useState(false);

  const handleClose = () => {
    setFullScreen(false);
    onClose();
  };

  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={handleClose}
      width={fullScreen ? EPortalWidth.FULL : EPortalWidth.THREE_QUARTER}
      position={EPortalPosition.RIGHT}
      fullScreen={fullScreen}
      contentClassName={fullScreen ? undefined : "w-[90%] max-w-none"}
    >
      <div
        className={`flex h-full flex-col overflow-hidden border-subtle bg-surface-1 text-left ${
          fullScreen ? "rounded-lg border" : "border-l"
        }`}
      >
        <div className="flex items-center justify-between gap-4 bg-surface-1 px-5 py-4 text-13">
          <h3 className="break-words">{projectDetails?.name ? `${projectDetails.name} 缺陷概览` : "缺陷概览"}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden place-items-center p-1 text-secondary hover:text-primary md:grid"
              onClick={() => setFullScreen((prev) => !prev)}
            >
              {fullScreen ? <Shrink size={14} strokeWidth={2} /> : <Expand size={14} strokeWidth={2} />}
            </button>
            <button
              type="button"
              className="grid place-items-center p-1 text-secondary hover:text-primary"
              onClick={handleClose}
            >
              <CloseIcon height={14} width={14} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DefectOverview workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      </div>
    </ModalPortal>
  );
});
