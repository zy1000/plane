"use client";

import * as React from "react";
import { Spin, message, Tag, Modal, Table, Tooltip, Upload, Pagination, Popconfirm, Menu } from "antd";
import * as LucideIcons from "lucide-react";
import { Download, Trash2 } from "lucide-react";
import { Button as PropelButton } from "@plane/propel/button";
import { ReadonlyDate } from "@/components/readonly/date";
import { cn, renderFormattedDate } from "@plane/utils";
import { PlanService as PlanApiService } from "@/services/qa/plan.service";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { useMember } from "@/hooks/store/use-member";
import { useSearchParams } from "next/navigation";
import { getEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";

type ExecRecord = {
  id: string;
  result: string;
  reason?: string | null;
  assignee?: string | null;
  created_at?: string;
  steps?: StepItem[] | null;
};

type StepItem = {
  description?: string;
  result?: string;
  actual_result?: string;
  exec_result?: string;
};

type FileItem = {
  id: string;
  name: string;
  size: number;
  path: string;
  created_at?: string;
};

type Props = {
  workspaceSlug: string | undefined;
  reviewId: string | undefined;
  caseId: string | undefined;
  className?: string;
};

export type ExecutionRecordDetailRecord = {
  id: string;
  steps?: any;
};

type ExecutionRecordDetailModalProps = {
  open: boolean;
  onClose: () => void;
  record: ExecutionRecordDetailRecord | null;
  workspaceSlug: string | undefined;
};

const normalizeStepsForDetail = (steps: any): StepItem[] => {
  if (!Array.isArray(steps)) return [];
  return steps.map((s: any) => ({
    description: String(s?.description ?? s?.desc ?? ""),
    result: String(s?.result ?? s?.expected_result ?? ""),
    actual_result: String(s?.actual_result ?? ""),
    exec_result: String(s?.exec_result ?? ""),
  }));
};

const formatFileSizeForDetail = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ExecutionRecordDetailModal: React.FC<ExecutionRecordDetailModalProps> = ({
  open,
  onClose,
  record,
  workspaceSlug,
}) => {
  const planService = React.useMemo(() => new PlanApiService(), []);
  const [resultColorMap, setResultColorMap] = React.useState<Record<string, string>>({});
  const [attachmentFiles, setAttachmentFiles] = React.useState<FileItem[]>([]);
  const [attachmentLoading, setAttachmentLoading] = React.useState(false);
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const [attachmentPage, setAttachmentPage] = React.useState(1);
  const [detailTab, setDetailTab] = React.useState<"steps" | "files">("steps");
  const attachmentPageSize = 10;

  React.useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(attachmentFiles.length / attachmentPageSize));
    if (attachmentPage > maxPage) setAttachmentPage(maxPage);
  }, [attachmentFiles.length, attachmentPage, attachmentPageSize]);

  React.useEffect(() => {
    if (!open || !workspaceSlug) return;
    getEnums(String(workspaceSlug))
      .then((enums) => setResultColorMap(enums?.plan_case_result || {}))
      .catch(() => {});
  }, [open, workspaceSlug]);

  React.useEffect(() => {
    if (!open || !record?.id || !workspaceSlug) return;
    let cancelled = false;
    setAttachmentLoading(true);
    planService
      .getExecutionFiles(String(workspaceSlug), record.id)
      .then((files) => {
        if (!cancelled) setAttachmentFiles(Array.isArray(files) ? (files as FileItem[]) : []);
      })
      .catch(() => {
        if (!cancelled) setAttachmentFiles([]);
      })
      .finally(() => {
        if (!cancelled) setAttachmentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, record?.id, workspaceSlug, planService]);

  const handleClose = React.useCallback(() => {
    setAttachmentFiles([]);
    setAttachmentPage(1);
    setDetailTab("steps");
    onClose();
  }, [onClose]);

  const handleUpload = React.useCallback(
    async (file: File) => {
      if (!workspaceSlug || !record?.id) return false;
      try {
        setUploadLoading(true);
        await planService.uploadExecutionFile(String(workspaceSlug), record.id, file);
        message.success("上传成功");
        const files = await planService.getExecutionFiles(String(workspaceSlug), record.id);
        setAttachmentFiles(Array.isArray(files) ? (files as FileItem[]) : []);
      } catch (e: any) {
        message.error(e?.message || e?.error || "上传失败");
      } finally {
        setUploadLoading(false);
      }
      return false;
    },
    [workspaceSlug, record?.id, planService]
  );

  const handleDeleteFile = React.useCallback(
    async (fileId: string) => {
      if (!workspaceSlug || !record?.id) return;
      try {
        await planService.deleteExecutionFile(String(workspaceSlug), record.id, fileId);
        message.success("删除成功");
        setAttachmentFiles((prev) => prev.filter((f) => f.id !== fileId));
      } catch (e: any) {
        message.error(e?.message || e?.error || "删除失败");
      }
    },
    [workspaceSlug, record?.id, planService]
  );

  const handleDownloadFile = React.useCallback(
    async (fileId: string, fileName: string) => {
      if (!workspaceSlug) return;
      try {
        const blob = await planService.downloadExecutionFile(String(workspaceSlug), fileId);
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      } catch (e: any) {
        message.error(e?.message || e?.error || "下载失败");
      }
    },
    [workspaceSlug, planService]
  );

  const StepsDetailTableInner: React.FC<{ steps: StepItem[]; resultColorMap: Record<string, string> }> = ({
    steps,
    resultColorMap: colorMap,
  }) => {
    if (!Array.isArray(steps) || steps.length === 0) {
      return <span className="text-secondary">暂无内容</span>;
    }
    const headerStyle = { backgroundColor: "var(--bg-layer-1)", padding: 12, border: "1px solid var(--border-subtle)" } as const;
    const cellStyle = { padding: 12, border: "1px solid var(--border-subtle)" } as const;
    const columns = [
      {
        title: "序号",
        key: "index",
        width: 80,
        render: (_: any, __: StepItem, idx: number) => idx + 1,
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
      {
        title: "步骤描述",
        dataIndex: "description",
        key: "description",
        width: 320,
        render: (text: any) => <span className="whitespace-pre-wrap break-words">{String(text || "")}</span>,
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
      {
        title: "预期结果",
        dataIndex: "result",
        key: "result",
        width: 320,
        render: (text: any) => (
          <span className="whitespace-pre-wrap break-words text-secondary">{String(text || "")}</span>
        ),
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
      {
        title: "实际结果",
        dataIndex: "actual_result",
        key: "actual_result",
        width: 320,
        render: (text: any) => <span className="whitespace-pre-wrap break-words">{String(text || "-")}</span>,
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
      {
        title: "步骤执行结果",
        dataIndex: "exec_result",
        key: "exec_result",
        width: 160,
        render: (text: any) => {
          const val = String(text || "");
          const color = colorMap[val] || undefined;
          return <Tag color={color}>{val || "-"}</Tag>;
        },
        onHeaderCell: () => ({ style: headerStyle }),
        onCell: () => ({ style: cellStyle }),
      },
    ];
    return (
      <div className="rounded border border-subtle">
        <div className="overflow-x-auto">
          <Table
            size="small"
            pagination={false}
            bordered={false}
            tableLayout="fixed"
            rowKey={(_: any, idx?: number) => String(idx ?? 0)}
            dataSource={steps}
            columns={columns as any}
            scroll={{ x: 1200 }}
          />
        </div>
      </div>
    );
  };

  if (!open) return null;

  return (
    <Modal
      title="详情"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={1400}
      style={{ maxWidth: "95vw" }}
      destroyOnClose
      getContainer={() => document.body}
      zIndex={1200}
    >
      <div className="flex h-[620px] flex-col">
        <Menu
          mode="horizontal"
          selectedKeys={[detailTab]}
          onClick={({ key }) => setDetailTab(key as "steps" | "files")}
          items={[
            { key: "steps", label: "步骤详情" },
            { key: "files", label: "执行附件" },
          ]}
        />
        <div className="mt-3 flex-1 min-h-0 overflow-y-scroll vertical-scrollbar scrollbar-sm pr-1">
          {detailTab === "steps" ? (
            <StepsDetailTableInner
              steps={record ? normalizeStepsForDetail(record.steps) : []}
              resultColorMap={resultColorMap}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-end">
                <Upload
                  showUploadList={false}
                  beforeUpload={(file) => {
                    handleUpload(file as unknown as File);
                    return false;
                  }}
                  disabled={uploadLoading}
                >
                  <button
                    type="button"
                    disabled={uploadLoading}
                    className="text-on-color bg-accent-primary hover:bg-accent-primary-hover focus:text-on-color focus:bg-accent-primary-hover px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <LucideIcons.Upload size={13} />
                    上传
                  </button>
                </Upload>
              </div>
              {attachmentLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spin size="small" />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed">
                      <thead>
                      <tr className="text-left text-sm text-secondary border-b">
                      <th className="w-2/5 px-2 py-2">文件名</th>
                          <th className="w-1/5 px-2 py-2">大小</th>
                          <th className="w-1/5 px-2 py-2">上传时间</th>
                          <th className="w-1/5 px-2 py-2 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attachmentFiles.length === 0 && (
                          <tr>
                            <td className="px-2 py-6 text-sm text-secondary" colSpan={4}>
                              暂无附件
                            </td>
                          </tr>
                        )}
                        {attachmentFiles
                          .slice((attachmentPage - 1) * attachmentPageSize, attachmentPage * attachmentPageSize)
                          .map((f) => (
                            <tr key={f.id} className="border-b hover:bg-layer-1">
                              <td className="px-2 py-2 truncate text-sm text-gray-800" title={f.name}>
                                {f.name}
                              </td>
                              <td className="px-2 py-2 text-sm text-primary">{formatFileSizeForDetail(f.size)}</td>
                              <td className="px-2 py-2 text-sm text-primary">
                                {f.created_at ? (
                                  <ReadonlyDate value={f.created_at} formatToken="yyyy-MM-dd" hideIcon={true} />
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-end gap-2">
                                  <PropelButton
                                    variant="link-neutral"
                                    className="p-0"
                                    onClick={() => handleDownloadFile(f.id, f.name)}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </PropelButton>
                                  <Popconfirm
                                    title="确认删除该文件？"
                                    okText="删除"
                                    cancelText="取消"
                                    onConfirm={() => void handleDeleteFile(f.id)}
                                  >
                                    <PropelButton variant="link-neutral" className="p-0 text-red-500 hover:text-red-600">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </PropelButton>
                                  </Popconfirm>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex-shrink-0 border-t border-subtle px-2 py-2 bg-surface-1 flex items-center justify-between mt-2">
                    <div className="text-sm text-secondary">
                      {attachmentFiles.length > 0 ? `共 ${attachmentFiles.length} 条` : ""}
                    </div>
                    <Pagination
                      simple
                      current={attachmentPage}
                      pageSize={attachmentPageSize}
                      total={attachmentFiles.length}
                      onChange={(p) => setAttachmentPage(p)}
                      size="small"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export const ExecutionRecordsPanel: React.FC<Props> = (props) => {
  const { workspaceSlug, reviewId, caseId, className = "" } = props;
  const planService = React.useMemo(() => new PlanApiService(), []);
  const { getUserDetails } = useMember();
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan_id") ?? searchParams.get("planId") ?? "";

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<ExecRecord[]>([]);
  const [resultColorMap, setResultColorMap] = React.useState<Record<string, string>>({});

  const [stepsModalOpen, setStepsModalOpen] = React.useState(false);
  const [stepsModalSteps, setStepsModalSteps] = React.useState<StepItem[]>([]);
  const [stepsModalRecordId, setStepsModalRecordId] = React.useState<string | null>(null);

  const normalizeSteps = React.useCallback((steps: any): StepItem[] => {
    if (!Array.isArray(steps)) return [];
    return steps.map((s) => ({
      description: String(s?.description ?? s?.desc ?? ""),
      result: String(s?.result ?? s?.expected_result ?? ""),
      actual_result: String(s?.actual_result ?? ""),
      exec_result: String(s?.exec_result ?? ""),
    }));
  }, []);

  const openStepsModal = React.useCallback(
    (rec: ExecRecord) => {
      try {
        const steps = normalizeSteps(rec?.steps ?? []);
        setStepsModalSteps(steps);
        setStepsModalRecordId(rec.id);
        setStepsModalOpen(true);
      } catch (e: any) {
        const msg = e?.message || "加载步骤详情失败";
        message.error(msg);
      }
    },
    [normalizeSteps]
  );

  const fetchEnums = async () => {
    if (!workspaceSlug) return;
    try {
      const enums = await getEnums(String(workspaceSlug));
      const map = enums?.plan_case_result || {};
      setResultColorMap(map);
    } catch {}
  };

  const fetchRecords = async () => {
    if (!workspaceSlug || !caseId || !planId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await planService.getPlanCaseRecord(String(workspaceSlug), {
        plan_id: String(planId),
        case_id: String(caseId),
      });
      const list = Array.isArray(data) ? (data as ExecRecord[]) : [];
      setRecords(list);
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "获取执行记录失败";
      setError(msg);
      message.error(msg);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchEnums();
  }, [workspaceSlug]);

  React.useEffect(() => {
    fetchRecords();
  }, [workspaceSlug, reviewId, caseId, planId]);

  const renderResult = (result: string) => {
    const val = String(result || "");
    const color = resultColorMap[val] || undefined;
    return <Tag color={color}>{val || "-"}</Tag>;
  };

  return (
    <>
      <div
        className={cn(
          "p-4 text-sm text-secondary",
          "min-h-[550px]",
          className
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spin />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">{error}</div>
        ) : records.length === 0 ? (
          <div className="text-secondary">暂无执行记录</div>
        ) : (
          <div className="flex flex-col gap-4">
            {records.map((r) => {
              const uid = r.assignee ? String(r.assignee) : null;
              const user = uid ? getUserDetails(uid) : undefined;
              const name = user?.display_name || "未知用户";
              const time = r.created_at ? renderFormattedDate(r.created_at, "YYYY-MM-DD HH:mm:ss") : "";
              return (
                <div
                  key={String(r.id)}
                  className="flex items-start justify-between gap-4 rounded-md bg-surface-1 p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      <MemberDropdown
                        buttonVariant="transparent-with-text"
                        multiple={false}
                        value={uid}
                        onChange={() => {}}
                        disabled
                        placeholder={name}
                        className="text-sm"
                        buttonContainerClassName="p-0 cursor-default"
                        buttonClassName="p-0 hover:bg-transparent hover:bg-inherit"
                        showUserDetails
                        optionsClassName="z-[60]"
                        button={<ButtonAvatars showTooltip={false} userIds={uid} size="lg" />}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{name}</div>
                      {r.reason ? (
                        <div className="text-sm text-secondary whitespace-pre-wrap break-words">
                          {String(r.reason)}
                        </div>
                      ) : null}
                      <div className="text-xs text-placeholder mt-2">{time}</div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {renderResult(r.result)}
                      <Tooltip title="详情" mouseEnterDelay={0.2} placement="top">
                        <button
                          type="button"
                          aria-label="查看详情"
                          aria-haspopup="dialog"
                          onClick={() => openStepsModal(r)}
                          className="p-1 rounded hover:bg-layer-1-hover active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-500 hover:text-blue-600"
                        >
                          <LucideIcons.ListOrdered size={16} aria-hidden="true" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ExecutionRecordDetailModal
        open={stepsModalOpen}
        onClose={() => {
          setStepsModalOpen(false);
          setStepsModalRecordId(null);
          setStepsModalSteps([]);
        }}
        record={
          stepsModalRecordId
            ? { id: stepsModalRecordId, steps: stepsModalSteps }
            : null
        }
        workspaceSlug={workspaceSlug}
      />
    </>
  );
};
