import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import type { TRequirementCloseReason, TUserRequirementListItem } from "@/services/requirement.service";

type TLifecycleAction = "closed" | "reopened";

type Props = {
  requirement: TUserRequirementListItem | null;
  action: TLifecycleAction | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (
    data:
      | { action: "closed"; reason_code: TRequirementCloseReason; note?: string }
      | { action: "reopened"; note: string }
  ) => Promise<void>;
};

const closeReasons: { value: TRequirementCloseReason; label: string }[] = [
  { value: "cancelled", label: "需求取消" },
  { value: "duplicate", label: "重复需求" },
  { value: "postponed", label: "暂不实施" },
  { value: "replaced", label: "已被替代" },
  { value: "other", label: "其他" },
];

export function RequirementLifecycleModal(props: Props) {
  const { action, isSubmitting, onClose, onSubmit, requirement } = props;
  const [reasonCode, setReasonCode] = useState<TRequirementCloseReason>("cancelled");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setReasonCode("cancelled");
    setNote("");
    setError("");
  }, [action, requirement?.id]);

  if (!action || !requirement) return null;

  const title = action === "closed" ? "关闭需求" : "重新打开需求";
  const requiresNote = action === "reopened" || (action === "closed" && reasonCode === "other");

  const handleSubmit = async () => {
    const normalizedNote = note.trim();
    if (requiresNote && !normalizedNote) {
      setError(action === "reopened" ? "请填写重新打开原因" : "请选择其他原因时填写说明");
      return;
    }
    setError("");
    if (action === "closed") await onSubmit({ action, reason_code: reasonCode, note: normalizedNote });
    else await onSubmit({ action, note: normalizedNote });
  };

  return (
    <ModalCore isOpen handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="px-5 py-4">
        <h3 className="text-16 font-semibold text-primary">{title}</h3>
        <p className="mt-1 text-12 text-secondary">“{requirement.name}”</p>

        {action === "closed" && (
          <label className="mt-4 block text-12 font-medium text-secondary">
            关闭原因
            <select
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value as TRequirementCloseReason)}
              className="focus:border-accent-primary mt-1 h-9 w-full rounded border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
            >
              {closeReasons.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-4 block text-12 font-medium text-secondary">
          {action === "reopened" ? "重新打开原因" : "补充说明"}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            placeholder={requiresNote ? "必填" : "可选"}
            className="focus:border-accent-primary mt-1 w-full resize-none rounded border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none"
          />
        </label>
        {error && <p className="mt-1 text-11 text-danger-primary">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" onClick={() => void handleSubmit()} loading={isSubmitting}>
            确认
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
