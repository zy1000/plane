"use client";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Modal, Form, Input, Select, DatePicker, Button, Space, message } from "antd";
// 说明：替换评审人选择器为统一的 MemberDropdown 组件，保持参数结构不变
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { RangePickerProps } from "antd/es/date-picker";
import { CaseService as ReviewService } from "@/services/qa/review.service";

type Props = {
  open: boolean;
  onClose: () => void;
  mode?: "create" | "edit";
  initialValues?: Partial<ReviewFormValues> & { id?: string };
};

type ReviewFormValues = {
  name: string;
  description?: string;
  module_id: string | null;
  assignees: string[];
  started_at?: any;
  ended_at?: any;
};

export default function CreateReviewModal({ open, onClose, mode = "create", initialValues }: Props) {
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug?: string; projectId?: string };
  const [submitting, setSubmitting] = useState(false);
  const reviewService = useMemo(() => new ReviewService(), []);
  const [moduleOptions, setModuleOptions] = useState<{ value: string; label: string }[]>([]);
  // 成员选择改为使用 MemberDropdown 的内部数据源

  const [form] = Form.useForm<ReviewFormValues>();

  const disabledDate: RangePickerProps["disabledDate"] = (current) => {
    const start = form.getFieldValue("started_at");
    if (!current || !start) return false;
    return current.isBefore(start, "day");
  };

  useEffect(() => {
    const values = form.getFieldsValue();
    const start = values.started_at;
    const end = values.ended_at;
    void (start && end);
  }, [form]);

  useEffect(() => {
    if (!open || !workspaceSlug || !projectId) return;
    reviewService
      .getReviewModules(String(workspaceSlug), String(projectId))
      .then((data) => {
        const opts = (Array.isArray(data) ? data : []).map((m: any) => ({
          value: String(m.id),
          label: String(m.name),
        }));
        setModuleOptions(opts);
      })
      .catch(() => setModuleOptions([]));
    // MemberDropdown 在首次打开时会自行触发成员数据获取
  }, [open, workspaceSlug, projectId, reviewService]);

  useEffect(() => {
    if (!open) return;
    const vals = initialValues || {};
    form.setFieldsValue({
      name: vals.name ?? "",
      description: vals.description ?? "",
      module_id: (vals as any)?.module ?? vals.module_id ?? null,
      assignees: Array.isArray(vals.assignees) ? vals.assignees : [],
      started_at: vals.started_at ? dayjs(vals.started_at) : undefined,
      ended_at: vals.ended_at ? dayjs(vals.ended_at) : undefined,
    });
  }, [open, initialValues, form]);

  const handleSubmit = async () => {
    if (!workspaceSlug) return;
    try {
      setSubmitting(true);
      const v = await form.validateFields();
      const selectedAssignees = Array.isArray(v.assignees) ? v.assignees : [];
      const payload: any = {
        name: v.name,
        description: v.description || "",
        module: v.module_id,
        assignees: selectedAssignees,
        mode: selectedAssignees.length <= 1 ? "单人评审" : "多人评审",
      };
      if (projectId) payload.project = projectId;
      if (mode === "create") {
        payload.started_at = v.started_at ? v.started_at.format("YYYY-MM-DD") : null;
        payload.ended_at = v.ended_at ? v.ended_at.format("YYYY-MM-DD") : null;
        await reviewService.createReview(String(workspaceSlug), payload);
        message.success("评审已创建");
      } else {
        if (v.started_at) payload.started_at = v.started_at.format("YYYY-MM-DD");
        if (v.ended_at) payload.ended_at = v.ended_at.format("YYYY-MM-DD");
        await reviewService.updateReview(String(workspaceSlug), { id: initialValues?.id, ...payload });
        message.success("评审已更新");
      }
      onClose();
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) {
      } else {
        message.error(e?.message || e?.detail || e?.error || (mode === "edit" ? "更新失败" : "创建失败"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={mode === "edit" ? "编辑评审" : "新建评审"}
      width={700}
      destroyOnClose
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSubmit} loading={submitting}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={{ name: "", description: "" }}>
        <Form.Item name="name" label="评审名称" rules={[{ required: true, message: "请输入评审名称" }]}>
          <Input placeholder="请输入评审名称" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} placeholder="请输入描述" />
        </Form.Item>
        <Form.Item name="module_id" label="所属模块">
          <Select placeholder="请选择所属模块" options={moduleOptions} showSearch allowClear />
        </Form.Item>
        <Form.Item name="assignees" label="评审人" rules={[{ required: true, message: "请选择评审人" }]}>
          <MemberDropdown
            multiple
            projectId={projectId ? String(projectId) : undefined}
            value={form.getFieldValue("assignees") ?? []}
            onChange={(val) => form.setFieldsValue({ assignees: Array.isArray(val) ? val : [] })}
            placeholder="请选择评审人"
            className="w-full"
            buttonVariant="transparent-with-text"
            showUserDetails={true}
            optionsClassName="z-[1100]"
          />
        </Form.Item>
        <Form.Item label="评审周期">
          <Space>
            <Form.Item name="started_at" noStyle>
              <DatePicker placeholder="开始日期" />
            </Form.Item>
            <span>至</span>
            <Form.Item
              name="ended_at"
              noStyle
              dependencies={["started_at"]}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue("started_at");
                    if (!start || !value || !value.isBefore(start, "day")) return Promise.resolve();
                    return Promise.reject(new Error("结束日期不能早于开始日期"));
                  },
                }),
              ]}
            >
              <DatePicker placeholder="结束日期" disabledDate={disabledDate} />
            </Form.Item>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
