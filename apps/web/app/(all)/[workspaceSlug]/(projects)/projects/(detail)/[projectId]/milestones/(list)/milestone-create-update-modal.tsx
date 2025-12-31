"use client";

import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { DatePicker, Form, Input, Modal, Select, Tag, message } from "antd";
import { useParams } from "next/navigation";

import { MilestoneService, type IMilestone } from "@/services/milestone.service";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: Partial<IMilestone> & { id?: string };
  onCancel: () => void;
  onSuccess: (milestone: IMilestone) => void;
};

type FormValues = {
  name: string;
  description?: string;
  state?: string | null;
  state_color?: string | null;
  start_date?: any;
  end_date?: any;
};

const milestoneService = new MilestoneService();

const STATE_OPTIONS = [
  { label: "未开始", color: "gray" },
  { label: "进行中", color: "blue" },
  { label: "延期", color: "red" },
  { label: "已完成", color: "green" },
];

export function MilestoneCreateUpdateModal(props: Props) {
  const { open, mode, initialValues, onCancel, onSuccess } = props;
  const { workspaceSlug, projectId } = useParams();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const modalTitle = useMemo(() => (mode === "edit" ? "编辑里程碑" : "创建里程碑"), [mode]);

  useEffect(() => {
    if (!open) return;

    const defaultState = STATE_OPTIONS[0];
    const start = initialValues?.start_date ? dayjs(initialValues.start_date) : null;
    const end = initialValues?.end_date ? dayjs(initialValues.end_date) : null;

    form.setFieldsValue({
      name: initialValues?.name ?? "",
      description: initialValues?.description ?? "",
      state: mode === "create" ? defaultState.label : (initialValues?.state ?? defaultState.label),
      state_color: mode === "create" ? defaultState.color : (initialValues?.state_color ?? defaultState.color),
      start_date: start,
      end_date: end,
    });
  }, [form, initialValues, mode, open]);

  const handleSubmit = async () => {
    const ws = String(workspaceSlug ?? "");
    const pid = String(projectId ?? "");
    if (!ws || !pid) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      const startDate = values.start_date ? dayjs(values.start_date).format("YYYY-MM-DD") : null;
      const endDate = values.end_date ? dayjs(values.end_date).format("YYYY-MM-DD") : null;

      const payload: Partial<IMilestone> = {
        project: pid,
        name: values.name,
        description: values.description ?? "",

        start_date: startDate,
        end_date: endDate,
      };

      const res =
        mode === "edit" && initialValues?.id
          ? await milestoneService.updateMilestone(ws, pid, String(initialValues.id), payload)
          : await milestoneService.createMilestone(ws, pid, payload);

      message.success(mode === "edit" ? "已保存" : "已创建");
      onSuccess(res);
      form.resetFields();
    } catch (e: any) {
      const msg = e?.detail || e?.error || e?.message || (mode === "edit" ? "保存失败" : "创建失败");
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const stateValue = Form.useWatch("state", form);
  const stateColor = Form.useWatch("state_color", form);
  const stateSelectOptions = useMemo(
    () =>
      STATE_OPTIONS.map((o) => ({
        value: o.label,
        label: (
          <Tag className="m-0" color={o.color}>
            {o.label}
          </Tag>
        ),
      })),
    []
  );

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={handleSubmit}
      okText={mode === "edit" ? "保存" : "创建"}
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
          <Input placeholder="请输入名称" />
        </Form.Item>

        <Form.Item label="描述" name="description">
          <Input.TextArea placeholder="请输入描述" rows={3} />
        </Form.Item>

        {/* <Form.Item label="状态" required>
          <Form.Item name="state" noStyle rules={[{ required: true, message: "请选择状态" }]}>
            <Select
              style={{ width: 180 }}
              options={stateSelectOptions}
              bordered={false}
              suffixIcon={null}
              disabled={mode === "create"}
              value={stateValue || "未开始"}
              onChange={(val) => {
                const found = STATE_OPTIONS.find((o) => o.label === val);
                form.setFieldValue("state_color", found?.color ?? null);
              }}
            />
          </Form.Item>
          <Form.Item name="state_color" hidden>
            <Input />
          </Form.Item>
        </Form.Item> */}

        <div className="grid grid-cols-2 gap-3">
          <Form.Item label="开始日期" name="start_date">
            <DatePicker className="w-full" placeholder="请选择开始日期" />
          </Form.Item>
          <Form.Item
            label="结束日期"
            name="end_date"
            dependencies={["start_date"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const start = getFieldValue("start_date");
                  if (!start || !value) return Promise.resolve();
                  const startDay = dayjs(start);
                  const endDay = dayjs(value);
                  if (endDay.isBefore(startDay, "day")) return Promise.reject(new Error("结束日期不能早于开始日期"));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <DatePicker className="w-full" placeholder="请选择结束日期" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
