"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, Button, Select } from "antd";
import { useTranslation } from "@plane/i18n";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PlanService } from "@/services/qa/plan.service";
import { qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  sourcePlanId: string;
  planOptions: Array<{ id: string; name: string }>;
  selectedPlanCaseIds: string[];
  onSuccess?: () => void;
};

export default function PlanCasesCopyModal({
  open,
  onClose,
  workspaceSlug,
  projectId,
  sourcePlanId,
  planOptions,
  selectedPlanCaseIds,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const planService = useRef(new PlanService()).current;
  const [targetPlanId, setTargetPlanId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetPlanId(null);
      setAssignee(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!workspaceSlug || !projectId || !sourcePlanId) {
      qaCaseSetToastWarning("缺少必要参数");
      return;
    }
    const planCaseIds = Array.from(new Set((selectedPlanCaseIds || []).map(String)));
    if (planCaseIds.length === 0) {
      qaCaseSetToastWarning("请先选择用例");
      return;
    }
    if (!targetPlanId) {
      qaCaseSetToastWarning("请选择目标计划");
      return;
    }
    const targetName = planOptions.find((p) => String(p.id) === targetPlanId)?.name || "";
    try {
      setSubmitting(true);
      const res = await planService.copyPlanCases(workspaceSlug, projectId, {
        source_plan_id: sourcePlanId,
        target_plan_id: targetPlanId,
        plan_case_ids: planCaseIds,
        assignee: assignee || null,
      });
      const copied = Number(res?.copied ?? 0);
      const skipped = Number(res?.skipped ?? 0);
      if (copied === 0) {
        qaCaseSetToastWarning(`所选用例在「${targetName}」中均已存在，未复制`);
      } else {
        const suffix = skipped > 0 ? `，${skipped} 条已存在已跳过` : "";
        qaCaseSetToastSuccess(`已复制 ${copied} 条到「${targetName}」${suffix}`);
      }
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "复制失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="复制到计划"
      open={open}
      onCancel={onClose}
      width={480}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          取消
        </Button>,
        <Button key="ok" type="primary" loading={submitting} onClick={handleConfirm}>
          确定
        </Button>,
      ]}
    >
      <div className="space-y-4">
        <div className="text-sm text-secondary">
          将已选择的 <span className="font-medium text-accent-primary">{selectedPlanCaseIds.length}</span>{" "}
          条用例复制到目标计划，执行结果将重置为「未执行」。
        </div>
        <div className="space-y-1">
          <div className="text-sm">
            目标计划<span className="text-danger-primary">*</span>
          </div>
          <Select
            className="w-full"
            value={targetPlanId ?? undefined}
            placeholder="选择目标计划"
            showSearch
            allowClear
            optionFilterProp="label"
            notFoundContent="没有其他可选计划"
            options={planOptions.map((p) => ({ value: String(p.id), label: String(p.name || "-") }))}
            onChange={(value) => setTargetPlanId(value ? String(value) : null)}
          />
        </div>
        <div className="space-y-1">
          <div className="text-sm">统一执行人</div>
          <MemberDropdown
            multiple={false}
            projectId={projectId || undefined}
            value={assignee}
            onChange={(value) => setAssignee(value ? String(value) : null)}
            placeholder="不指定（沿用各用例原执行人）"
            buttonVariant="border-with-text"
            showUserDetails
            optionsClassName="z-[1100]"
          />
          <div className="text-xs text-secondary">不选择时，每条用例沿用其在当前计划中的执行人。</div>
        </div>
      </div>
    </Modal>
  );
}
