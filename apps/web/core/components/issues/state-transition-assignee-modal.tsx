import { Fragment, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@plane/ui";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

type TStateTransitionAssigneeModalProps = {
  isOpen: boolean;
  projectId: string;
  allowedAssigneeIds: string[];
  initialAssigneeIds: string[];
  showApprovalReason?: boolean;
  showAssigneeSelection?: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (payload: { assigneeIds: string[]; approvalReason: string }) => Promise<void> | void;
};

export const StateTransitionAssigneeModal = ({
  isOpen,
  projectId,
  allowedAssigneeIds,
  initialAssigneeIds,
  showApprovalReason = false,
  showAssigneeSelection = true,
  isSubmitting = false,
  onClose,
  onConfirm,
}: TStateTransitionAssigneeModalProps) => {
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [approvalReason, setApprovalReason] = useState("");

  const normalizedAllowedAssigneeIds = useMemo(
    () => Array.from(new Set(allowedAssigneeIds)),
    [allowedAssigneeIds]
  );

  useEffect(() => {
    if (!isOpen) return;
    const allowedSet = new Set(normalizedAllowedAssigneeIds);
    setSelectedAssigneeIds(initialAssigneeIds.filter((id) => allowedSet.has(id)));
    setApprovalReason("");
  }, [initialAssigneeIds, isOpen, normalizedAllowedAssigneeIds]);

  const noAllowedAssignees = showAssigneeSelection && normalizedAllowedAssigneeIds.length === 0;
  const canConfirm =
    !isSubmitting &&
    (!showAssigneeSelection || (!noAllowedAssignees && selectedAssigneeIds.length > 0)) &&
    (!showApprovalReason || approvalReason.trim().length > 0);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await onConfirm({
      assigneeIds: selectedAssigneeIds,
      approvalReason: approvalReason.trim(),
    });
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-30" onClose={onClose} data-prevent-outside-click>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-backdrop" />
        </Transition.Child>

        <div className="fixed inset-0 z-30 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="flex flex-col w-full max-w-lg min-h-[280px] overflow-hidden rounded-xl bg-surface-1 shadow-raised-200">
                <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
                  <div>
                    <Dialog.Title className="text-base font-semibold text-primary">
                      {showApprovalReason ? "发起状态变更审批" : "选择目标负责人"}
                    </Dialog.Title>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-4 px-5 py-4">
                  {showAssigneeSelection && noAllowedAssignees ? (
                    <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>目标状态未解析到可选负责人，请联系项目管理员调整工作流配置。</span>
                    </div>
                  ) : showAssigneeSelection ? (
                    <div className="space-y-2">
                      <p className="text-xs text-secondary">
                        可选负责人（{normalizedAllowedAssigneeIds.length}）
                      </p>
                      <div className="h-9">
                        <MemberDropdown
                          multiple
                          value={selectedAssigneeIds}
                          onChange={setSelectedAssigneeIds}
                          projectId={projectId}
                          memberIds={normalizedAllowedAssigneeIds}
                          placeholder="请选择负责人"
                          buttonVariant="border-with-text"
                          dropdownArrow
                          className="w-full"
                          buttonContainerClassName="h-full w-full text-left"
                        />
                      </div>
                    </div>
                  ) : null}

                  {showApprovalReason && (
                    <div className="space-y-2">
                      <p className="text-xs text-secondary">
                        变更原因
                        <span className="text-danger-primary">*</span>
                      </p>
                      <textarea
                        value={approvalReason}
                        onChange={(e) => setApprovalReason(e.target.value)}
                        placeholder="请填写变更原因"
                        rows={4}
                        className="w-full resize-none rounded-md border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-tertiary outline-none transition-colors focus:border-accent-primary/60"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
                  <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={isSubmitting}>
                    取消
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!canConfirm} loading={isSubmitting}>
                    确认并提交
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
