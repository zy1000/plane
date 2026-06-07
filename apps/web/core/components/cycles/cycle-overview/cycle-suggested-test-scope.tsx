"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import { ClipboardList, Maximize2, Pencil } from "lucide-react";
import { CycleRichTextEditor, isEmptyCycleRichText } from "@/components/cycles/cycle-rich-text-editor";
import { CycleSuggestedTestScopeFullscreenModal } from "@/components/cycles/cycle-overview/cycle-suggested-test-scope-fullscreen-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  value: string | null | undefined;
  canEdit: boolean;
};

export const CycleSuggestedTestScope = observer(function CycleSuggestedTestScope(props: Props) {
  const { workspaceSlug, projectId, cycleId, value, canEdit } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialEdit, setModalInitialEdit] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-3.5 w-3.5 text-placeholder" />
          <span className="text-sm font-medium text-primary">建议测试范围</span>
        </div>
        <div className="flex items-center gap-1">
          {canEdit ? (
            <button
              type="button"
              className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
              onClick={() => {
                setModalInitialEdit(true);
                setModalOpen(true);
              }}
              aria-label="编辑建议测试范围"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
            onClick={() => {
              setModalInitialEdit(false);
              setModalOpen(true);
            }}
            aria-label="放大"
          >
            <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
          </button>
        </div>
      </div>

      {!isEmptyCycleRichText(value) ? (
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 overflow-y-auto pr-1 vertical-scrollbar scrollbar-sm">
            <CycleRichTextEditor
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              editorId={`cycle-suggested-test-scope-${cycleId}-card`}
              initialValue={value}
              editable={false}
              containerClassName="!pb-0 !pl-0 text-sm leading-relaxed text-secondary"
            />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无建议测试范围</div>
      )}

      <CycleSuggestedTestScopeFullscreenModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalInitialEdit(false);
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        value={value}
        canEdit={canEdit}
        initialEditing={modalInitialEdit}
      />
    </div>
  );
});
