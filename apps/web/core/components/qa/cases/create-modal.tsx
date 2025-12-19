// 顶部 imports（新增 Select）
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal, Form, Input, Button, message, Select } from "antd";
import { CaseService } from "@/services/qa/case.service";
import { ExpandAltOutlined, PlusOutlined } from "@ant-design/icons";
// 删除顶层 Quill import，改为动态加载
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { WorkItemTable } from "./work-item-table";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import * as LucideIcons from "lucide-react";
// 新增：文件上传工具与仓库服务
import { FileUploadService } from "@/services/file-upload.service";
import { getFileMetaDataForUpload, generateFileUploadPayload } from "@plane/services";
import { RepositoryService } from "@/services/qa/repository.service";
// 修正：使用相对路径导入枚举获取函数

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  // 只读展示字段
  repositoryId: string;
  repositoryName: string;
  // 创建成功回调（用于刷新列表或其它联动）
  onSuccess?: () => void | Promise<void>;
};

const caseService = new CaseService();

import type { TIssue, TPartialProject } from "@plane/types";
import { WorkItemSelectModal } from "./work-item-select-modal";
import { projectIssueTypesCache, ProjectIssueTypeService, ProjectService, type TIssueType } from "@/services/project";

import { getEnums } from "app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import { useMember } from "@/hooks/store/use-member";
import { IssueService } from "@/services/issue/issue.service";
import { Logo } from "@plane/propel/emoji-icon-picker";

type StepRow = { description?: string; result?: string };

const StepsEditor: React.FC<{
  value?: StepRow[];
  onChange?: (v: StepRow[]) => void;
}> = ({ value, onChange }) => {
  const rows = Array.isArray(value) && value.length > 0 ? value : [{ description: "", result: "" }];

  useEffect(() => {
    if (!Array.isArray(value) || value.length === 0) {
      onChange?.([{ description: "", result: "" }]);
    }
  }, [value, onChange]);

  const tableBorder = "1px solid #d9d9d9";
  const thStyle: React.CSSProperties = {
    padding: 8,
    border: tableBorder,
    background: "#fafafa",
    textAlign: "left",
    fontWeight: 500,
  };
  const tdStyle: React.CSSProperties = {
    padding: 5,
    border: tableBorder,
    verticalAlign: "top",
  };

  const dragItem = React.useRef<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const [expandedEdit, setExpandedEdit] = useState<{
    visible: boolean;
    rowIndex: number;
    field: "description" | "result";
    value: string;
  }>({
    visible: false,
    rowIndex: -1,
    field: "description",
    value: "",
  });

  const update = (next: StepRow[]) => onChange?.(next);

  const handleAdd = () => update([...rows, { description: "", result: "" }]);

  const handleRemove = (idx: number) => {
    if (rows.length <= 1) {
      update([{ description: "", result: "" }]);
    } else {
      update(rows.filter((_, i) => i !== idx));
    }
  };

  const handleCell = (idx: number, key: "description" | "result", val: string) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [key]: val } : r));
    update(next);
  };

  const handleDropOnRow = (dropIdx: number) => {
    const dragIdx = dragItem.current;
    if (dragIdx === null || dragIdx === dropIdx) {
      dragItem.current = null;
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    update(next);
    dragItem.current = null;
  };

  const openExpandedEdit = (rowIndex: number, field: "description" | "result") => {
    setExpandedEdit({
      visible: true,
      rowIndex,
      field,
      value: rows[rowIndex]?.[field] || "",
    });
  };

  const saveExpandedEdit = () => {
    if (expandedEdit.rowIndex >= 0) {
      handleCell(expandedEdit.rowIndex, expandedEdit.field, expandedEdit.value);
    }
    setExpandedEdit({
      visible: false,
      rowIndex: -1,
      field: "description",
      value: "",
    });
  };

  const cancelExpandedEdit = () => {
    setExpandedEdit({
      visible: false,
      rowIndex: -1,
      field: "description",
      value: "",
    });
  };

  return (
    <div>
      <Modal
        open={expandedEdit.visible}
        onCancel={cancelExpandedEdit}
        title={expandedEdit.field === "description" ? "编辑步骤描述" : "编辑预期结果"}
        width="60vw"
        footer={[
          <Button key="cancel" onClick={cancelExpandedEdit}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={saveExpandedEdit}>
            保存
          </Button>,
        ]}
        destroyOnClose
      >
        <Input.TextArea
          autoSize={{ minRows: 6, maxRows: 20 }}
          placeholder={expandedEdit.field === "description" ? "请输入步骤描述" : "请输入预期结果"}
          value={expandedEdit.value}
          onChange={(e) => setExpandedEdit((prev) => ({ ...prev, value: e.target.value }))}
          style={{ width: "100%" }}
        />
      </Modal>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: "1px solid #d9d9d9",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 72 }} />
          <col />
          <col style={{ width: "30%" }} />
          <col style={{ width: 100 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>编号</th>
            <th style={thStyle}>步骤描述</th>
            <th style={thStyle}>预期结果</th>
            <th style={thStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              style={{ cursor: "default" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                handleDropOnRow(idx);
                setDraggingIndex(null);
              }}
            >
              <td
                style={{ ...tdStyle, cursor: draggingIndex === idx ? "grabbing" : "grab" }}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                draggable
                onMouseDown={() => setDraggingIndex(idx)}
                onDragStart={(e) => {
                  dragItem.current = idx;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDraggingIndex(null)}
              >
                {hoveredIndex === idx ? (
                  <span
                    aria-label="drag-handle"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      cursor: draggingIndex === idx ? "grabbing" : "grab",
                      WebkitUserSelect: "none",
                      userSelect: "none",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="#999"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ display: "block", transform: "rotate(90deg)" }}
                    >
                      <circle cx="5" cy="6" r="1.6" />
                      <circle cx="10" cy="6" r="1.6" />
                      <circle cx="15" cy="6" r="1.6" />
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="10" cy="12" r="1.6" />
                      <circle cx="15" cy="12" r="1.6" />
                    </svg>
                  </span>
                ) : (
                  <span style={{ cursor: draggingIndex === idx ? "grabbing" : "grab" }}>{idx + 1}</span>
                )}
              </td>
              <td style={tdStyle}>
                <div className="group" style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <Input.TextArea
                    bordered={false}
                    autoSize={{ minRows: 1, maxRows: 8 }}
                    placeholder="请输入步骤描述"
                    value={row?.description ?? ""}
                    onChange={(e) => handleCell(idx, "description", e.target.value)}
                    style={{
                      padding: 0,
                      background: "transparent",
                      lineHeight: "20px",
                      flex: 1,
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<ExpandAltOutlined />}
                    onClick={() => openExpandedEdit(idx, "description")}
                    title="放大编辑"
                    className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                  />
                </div>
              </td>
              <td style={tdStyle}>
                <div className="group" style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <Input.TextArea
                    bordered={false}
                    autoSize={{ minRows: 1, maxRows: 8 }}
                    placeholder="请输入预期结果"
                    value={row?.result ?? ""}
                    onChange={(e) => handleCell(idx, "result", e.target.value)}
                    style={{
                      padding: 0,
                      background: "transparent",
                      lineHeight: "20px",
                      flex: 1,
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<ExpandAltOutlined />}
                    onClick={() => openExpandedEdit(idx, "result")}
                    title="放大编辑"
                    className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                  />
                </div>
              </td>
              <td style={tdStyle}>
                <Button danger type="link" onClick={() => handleRemove(idx)}>
                  删除
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-start" }}>
        <Button color="primary" variant="text" icon={<PlusOutlined />} onClick={handleAdd}>
          新增步骤
        </Button>
      </div>
    </div>
  );
};

type QuillFieldProps = { value?: string; onChange?: (val: string) => void; placeholder?: string };

const QuillField: React.FC<QuillFieldProps> = ({ value, onChange, placeholder }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const quillRef = React.useRef<any>(null);
  const toolbarRef = React.useRef<HTMLElement | null>(null);
  const textChangeHandlerRef = React.useRef<((...args: any[]) => void) | null>(null);
  const keydownHandlerRef = React.useRef<((e: KeyboardEvent) => void) | null>(null);
  const initialClassNameRef = React.useRef<string>("");
  const onChangeRef = React.useRef<typeof onChange>(onChange);
  const [quillLoaded, setQuillLoaded] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadQuill = async () => {
      try {
        const container = containerRef.current;
        if (!container || quillRef.current) return;
        initialClassNameRef.current = container.className;

        const q = new Quill(container, {
          theme: "snow",
          placeholder: placeholder || undefined,
        });
        quillRef.current = q;
        toolbarRef.current = (q.getModule("toolbar") as any)?.container ?? null;

        if (typeof value === "string") {
          q.root.innerHTML = value || "";
        }

        const handleTextChange = () => {
          const html = q.root.innerHTML;
          onChangeRef.current?.(html);
        };
        textChangeHandlerRef.current = handleTextChange;
        q.on("text-change", handleTextChange);

        const handleKeyDown = (e: KeyboardEvent) => {
          const isFocused =
            !!q?.hasFocus() || (document.activeElement && container.contains(document.activeElement as Node));
          if (!isFocused) return;
          if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Escape" || e.key === "Tab") return;
          e.stopPropagation();
        };
        keydownHandlerRef.current = handleKeyDown;
        container.addEventListener("keydown", handleKeyDown, { capture: true });

        setQuillLoaded(true);
      } catch (error) {
        console.error("Failed to load Quill:", error);
      }
    };

    loadQuill();

    return () => {
      const q = quillRef.current;
      const textChangeHandler = textChangeHandlerRef.current;
      if (q && textChangeHandler) {
        try {
          q.off("text-change", textChangeHandler);
        } catch {}
      }
      textChangeHandlerRef.current = null;

      const container = containerRef.current;
      const keydownHandler = keydownHandlerRef.current;
      if (container && keydownHandler) {
        container.removeEventListener("keydown", keydownHandler, { capture: true } as any);
      }
      keydownHandlerRef.current = null;

      const toolbar = toolbarRef.current;
      if (toolbar?.parentNode) {
        toolbar.parentNode.removeChild(toolbar);
      }
      toolbarRef.current = null;

      if (container) {
        container.innerHTML = "";
        container.className = initialClassNameRef.current;
      }
      quillRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!quillLoaded || !quillRef.current || typeof value !== "string") return;

    const currentHTML = quillRef.current.root.innerHTML;
    if (value !== currentHTML) {
      quillRef.current.root.innerHTML = value || "";
    }
  }, [value, quillLoaded]);

  return (
    <div style={{ border: "1px solid #d9d9d9", borderRadius: 4 }}>
      <div ref={containerRef} style={{ minHeight: 180 }} />
      {!quillLoaded && <div style={{ padding: 16, textAlign: "center", color: "#999" }}>加载富文本编辑器...</div>}
    </div>
  );
};

export const CreateCaseModal: React.FC<Props> = (props) => {
  const { isOpen, handleClose, workspaceSlug, repositoryId, repositoryName, onSuccess } = props;

  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const title = useMemo(() => "新建测试用例", []);
  const [isWorkItemModalOpen, setIsWorkItemModalOpen] = useState<boolean>(false);
  // 新增：选中工作项状态（用于表格回显）
  const [selectedIssues, setSelectedIssues] = useState<TIssue[]>([]);
  // 新增：枚举数据状态
  const [enumsData, setEnumsData] = useState<{
    case_type?: Record<string, string>;
    case_priority?: Record<string, string>;
    case_test_type?: Record<string, string>;
  }>({});

  // 新增：删除单个已选工作项，并同步表单显示文本
  const handleRemoveSelected = (id: string) => {
    const nextSelected = selectedIssues.filter((item) => item.id !== id);
    setSelectedIssues(nextSelected);
    form.setFieldsValue({ issues: nextSelected.map((i) => i.name).join(", ") });
  };
  // 新增：服务实例与状态
  const projectService = useMemo(() => new ProjectService(), []);
  const issueTypeService = useMemo(() => new ProjectIssueTypeService(), []);
  const [projects, setProjects] = useState<TPartialProject[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, TPartialProject>>({});
  // key 为 projectId，value 为该项目的类型映射
  const [projectIssueTypesMaps, setProjectIssueTypesMaps] = useState<Record<string, Record<string, TIssueType>>>({});

  // 从弹窗确认回调中接收选中项
  const handleWorkItemConfirm = (selected: TIssue[]) => {
    setSelectedIssues(selected);
    const text = selected.map((i) => i.name).join(", ");
    form.setFieldsValue({ issues: text });
    setIsWorkItemModalOpen(false);
    refreshSelectedIssuesDetails();
  };

  const refreshSelectedIssuesDetails = async () => {
    try {
      const groups: Record<string, string[]> = {};
      selectedIssues.forEach((i) => {
        const pid = String(i.project_id || "");
        if (!pid) return;
        if (!groups[pid]) groups[pid] = [];
        groups[pid].push(String(i.id));
      });
      const issueService = new IssueService();
      const updates: TIssue[] = [];
      for (const pid of Object.keys(groups)) {
        const ids = groups[pid];
        const refreshed = await issueService.retrieveIssues(workspaceSlug, pid, ids);
        updates.push(...(Array.isArray(refreshed) ? refreshed : []));
      }
      if (updates.length > 0) {
        const map = new Map<string, TIssue>();
        updates.forEach((u) => map.set(String(u.id), u));
        setSelectedIssues((prev) => prev.map((i) => map.get(String(i.id)) || i));
      }
    } catch {}
  };

  useEffect(() => {
    if (isWorkItemModalOpen) return;
    const uniqueProjectIds = Array.from(new Set(selectedIssues.map((i) => String(i.project_id)))).filter(Boolean);
    if (uniqueProjectIds.length === 0) return;
    Promise.all(
      uniqueProjectIds.map((pid) =>
        issueTypeService
          .fetchProjectIssueTypes(workspaceSlug, pid)
          .then(() => ({ pid, map: projectIssueTypesCache.get(pid) || {} }))
          .catch(() => ({ pid, map: {} }))
      )
    ).then((results) => {
      const combined: Record<string, Record<string, TIssueType>> = {};
      results.forEach(({ pid, map }) => {
        combined[pid] = map || {};
      });
      setProjectIssueTypesMaps((prev) => ({ ...prev, ...combined }));
    });
    refreshSelectedIssuesDetails();
  }, [isWorkItemModalOpen, workspaceSlug, selectedIssues, issueTypeService]);
  // 新增：附件选择与管理
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const handlePickAttachments = () => fileInputRef.current?.click();

  // 新增：上传服务与仓库服务实例
  const fileUploadService = useMemo(() => new FileUploadService(), []);
  const repositoryService = useMemo(() => new RepositoryService(), []);

  // 新增：获取枚举数据
  useEffect(() => {
    if (!isOpen || !workspaceSlug) return;

    const fetchEnums = async () => {
      try {
        const enums = await getEnums(workspaceSlug);
        setEnumsData({
          case_type: enums.case_type || {},
          case_priority: enums.case_priority || {},
          case_test_type: enums.case_test_type || {},
        });
      } catch (error) {
        console.error("获取枚举数据失败:", error);
        message.error("获取枚举数据失败");
      }
    };

    fetchEnums();
  }, [isOpen, workspaceSlug]);

  // 生成用例类型下拉选项
  const caseTypeOptions = useMemo(() => {
    return Object.entries(enumsData.case_type || {}).map(([value, label]) => ({
      value,
      label,
    }));
  }, [enumsData.case_type]);

  const caseTestTypeOptions = useMemo(() => {
    return Object.entries(enumsData.case_test_type || {}).map(([value, label]) => ({
      value,
      label,
    }));
  }, [enumsData.case_test_type]);

  // 生成优先级下拉选项
  const casePriorityOptions = useMemo(() => {
    return Object.entries(enumsData.case_priority || {}).map(([value, label]) => ({
      value,
      label,
    }));
  }, [enumsData.case_priority]);

  // 新增：标签状态管理
  const [labelInput, setLabelInput] = useState("");
  const [labelList, setLabelList] = useState<any[]>([]);

  // 处理创建标签
  const handleCreateLabel = async () => {
    const name = labelInput.trim();
    if (!name || !workspaceSlug || !repositoryId) return;

    try {
      // 调用创建接口，caseId传空字符串
      const res = await caseService.createlabel(workspaceSlug, name, undefined, repositoryId);
      // 假设返回结果包含新创建的标签对象，或者直接使用返回结果
      // 这里根据 service 实现，res 可能是标签对象或数组
      // 假设 res 是数组，取第一个；或者是对象
      const newLabel = Array.isArray(res) ? res[0] : res;

      if (newLabel && newLabel.id) {
        setLabelList((prev) => [...prev, newLabel]);
        setLabelInput("");
      }
    } catch (error) {
      console.error("创建标签失败:", error);
      message.error("创建标签失败");
    }
  };

  // 处理删除标签
  const handleDeleteLabel = async (labelId: string) => {
    if (!workspaceSlug || !labelId) return;
    try {
      await caseService.deletelabel(workspaceSlug, labelId, undefined);
      setLabelList((prev) => prev.filter((l) => l.id !== labelId));
    } catch (error) {
      console.error("删除标签失败:", error);
      message.error("删除标签失败");
    }
  };

  // 弹窗打开后，根据选项自动设置默认值（不覆盖用户已选择）
  useEffect(() => {
    if (!isOpen) return;

    const updates: Record<string, any> = {};

    if (!form.getFieldValue("type") && caseTypeOptions.length > 0) {
      updates.type = caseTypeOptions[0].value;
    }
    if (!form.getFieldValue("priority") && casePriorityOptions.length > 0) {
      updates.priority = casePriorityOptions[0].value;
    }
    if (!form.getFieldValue("test_type") && caseTestTypeOptions.length > 0) {
      updates.test_type = caseTestTypeOptions[0].value;
    }

    if (Object.keys(updates).length > 0) {
      form.setFieldsValue(updates);
    }
  }, [isOpen, caseTypeOptions, casePriorityOptions, caseTestTypeOptions]);

  // 复用成员来源与状态，保持与计划模块一致的调用链
  const {
    getUserDetails,
    workspace: { workspaceMemberIds, isUserSuspended },
  } = useMember();

  // 维护人下拉选项（单选）
  const assigneeOptions = useMemo(
    () =>
      (workspaceMemberIds ?? []).map((userId) => {
        const user = getUserDetails(userId);
        return {
          value: userId,
          label: user?.display_name ?? "",
          disabled: isUserSuspended(userId, workspaceSlug),
        };
      }),
    [workspaceMemberIds, getUserDetails, isUserSuspended, workspaceSlug]
  );

  // 新增：仓库对应项目ID（用于 ProjectAssetEndpoint）
  const [repoProjectId, setRepoProjectId] = useState<string>("");
  // 新增：上传后的 AssetId 列表与上传中的状态映射
  const [attachmentAssetIds, setAttachmentAssetIds] = useState<string[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState<Record<string, boolean>>({});
  // 新增：文件键到 assetId 的映射，保证删除时能找到对应资产
  const [attachmentAssetMap, setAttachmentAssetMap] = useState<Record<string, string>>({});

  // 新增：三段式上传函数（ProjectAssetEndpoint -> S3 upload -> PATCH）
  const uploadAttachmentViaProjectAssetEndpoint = async (file: File) => {
    try {
      if (!workspaceSlug) {
        message.error("缺少必要参数(workspaceSlug)，无法上传附件");
        return;
      }
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setAttachmentUploading((prev) => ({ ...prev, [key]: true }));

      // 1. 获取签名（固定 entity_type 为 CASE_ATTACHMENT）
      const meta = await getFileMetaDataForUpload(file);
      const presignResp = await caseService.post(`/api/assets/v2/workspaces/${workspaceSlug}/`, {
        ...meta,
        entity_type: "CASE_ATTACHMENT",
        entity_identifier: "",
      });
      const signed = presignResp?.data ?? presignResp;

      // 2. 直传到对象存储
      const payload = generateFileUploadPayload(signed, file);
      await fileUploadService.uploadFile(signed.upload_data.url, payload);

      // 3. 标记已上传
      await caseService.patch(`/api/assets/v2/workspaces/${workspaceSlug}/${signed.asset_id}/`);
      // 记录 assetId，用于提交与删除
      setAttachmentAssetIds((prev) => [...prev, String(signed.asset_id)]);
      setAttachmentAssetMap((prev) => ({ ...prev, [key]: String(signed.asset_id) }));
      message.success(`附件 ${file.name} 上传完成`);
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "附件上传失败";
      message.error(msg);
    } finally {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      setAttachmentUploading((prev) => ({ ...prev, [key]: false }));
    }
  };
  const [moduleOptions, setModuleOptions] = useState<{ label: string; value: string }[]>([]);
  const flattenModules = (list: any[]): { id: string; name: string }[] => {
    const res: { id: string; name: string }[] = [];
    const dfs = (nodes: any[]) => {
      (nodes || []).forEach((n) => {
        const id = String(n?.id ?? "");
        const name = String(n?.name ?? "-");
        if (id) res.push({ id, name });
        if (Array.isArray(n?.children) && n.children.length > 0) dfs(n.children);
      });
    };
    dfs(list || []);
    return res;
  };

  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setAttachmentFiles((prev) => [...prev, ...files]);
      // 逐个文件进行三段式上传
      files.forEach((file) => uploadAttachmentViaProjectAssetEndpoint(file));
    }
    // 重置 input 值，允许同名文件重复选择
    e.target.value = "";
  };

  const handleRemoveAttachment = async (idx: number) => {
    const file = attachmentFiles[idx];
    if (!file) return;
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    const uploading = !!attachmentUploading[key];
    if (uploading) {
      message.warning("该附件正在上传，无法删除");
      return;
    }
    const assetId = attachmentAssetMap[key];
    try {
      // 如果已存在对应 assetId，先调用接口删除后端资产
      if (assetId) {
        await caseService.deleteWorkspaceAsset(workspaceSlug, assetId);
      }
      // 本地状态同步移除
      setAttachmentFiles((prev) => prev.filter((_, i) => i !== idx));
      if (assetId) {
        setAttachmentAssetIds((prev) => prev.filter((id) => id !== assetId));
      }
      setAttachmentAssetMap((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
      message.success("附件已删除");
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "附件删除失败";
      message.error(msg);
    }
  };

  // 加载项目列表用于“项目”列显示名称与 Logo
  useEffect(() => {
    if (!isOpen) return;
    projectService
      .getProjectsLite(workspaceSlug)
      .then((data) => setProjects(data || []))
      .catch(() => void 0);
  }, [isOpen, workspaceSlug, projectService]);

  useEffect(() => {
    const map = Object.fromEntries((projects || []).map((p) => [String(p.id), p]));
    setProjectsMap(map);
  }, [projects]);

  // 渲染类型图标（复用选择弹窗的逻辑）
  const renderIssueTypeIcon = (record: TIssue) => {
    const pid = String(record?.project_id ?? "");
    const typeId = (record as any)?.type_id as string | undefined;
    const map = projectIssueTypesMaps?.[pid];
    if (typeId && map && map[typeId]?.logo_props?.icon) {
      const { name, color, background_color } = map[typeId].logo_props!.icon!;
      const IconComp = (LucideIcons as any)[name] as React.FC<any> | undefined;
      return (
        <span
          className="inline-flex items-center justify-center rounded-sm"
          style={{
            backgroundColor: background_color || "transparent",
            color: color || "currentColor",
            width: "16px",
            height: "16px",
          }}
          aria-label={`Issue type: ${map[typeId].name}`}
        >
          {IconComp ? (
            <IconComp className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <LucideIcons.Layers className="h-3.5 w-3.5" />
          )}
        </span>
      );
    }
    return <LucideIcons.Layers className="h-3.5 w-3.5" />;
  };

  // 当选中工作项变化时，根据涉及的项目拉取类型映射，用于“类型”列展示
  useEffect(() => {
    const uniqueProjectIds = Array.from(new Set(selectedIssues.map((i) => String(i.project_id)))).filter(Boolean);
    if (uniqueProjectIds.length === 0) return;

    Promise.all(
      uniqueProjectIds.map((pid) =>
        issueTypeService
          .fetchProjectIssueTypes(workspaceSlug, pid)
          .then(() => ({ pid, map: projectIssueTypesCache.get(pid) || {} }))
          .catch(() => ({ pid, map: {} }))
      )
    ).then((results) => {
      const combined: Record<string, Record<string, TIssueType>> = {};
      results.forEach(({ pid, map }) => {
        combined[pid] = map || {};
      });
      setProjectIssueTypesMaps((prev) => ({ ...prev, ...combined }));
    });
  }, [workspaceSlug, selectedIssues, issueTypeService]);

  // 新增：工作项表格列，补全“类型”并新增“项目”
  const workItemColumns = useMemo(
    () => [
      {
        title: "名称",
        dataIndex: "name",
        key: "name",
        render: (_: any, record: TIssue) => <span className="truncate">{record.name}</span>,
      },
      {
        title: "状态",
        key: "state",
        render: (_: any, record: TIssue) => (
          <StateDropdown
            value={record?.state_id}
            onChange={() => {}}
            projectId={record?.project_id?.toString() ?? ""}
            disabled={true}
            buttonVariant="transparent-with-text"
            className="group w-full"
            buttonContainerClassName="w-full text-left"
            buttonClassName="text-xs"
            dropdownArrow
          />
        ),
      },
      {
        title: "类型",
        key: "type_id",
        dataIndex: "type_id",
        render: (_: any, record: TIssue) => {
          const pid = String(record?.project_id ?? "");
          const typeId = (record as any)?.type_id as string | undefined;
          const map = projectIssueTypesMaps?.[pid];
          const typeName = typeId && map ? map[typeId]?.name : undefined;
          return (
            <div className="flex items-center gap-2">
              {renderIssueTypeIcon(record)}
              <span className="truncate">{typeName ?? "-"}</span>
            </div>
          );
        },
      },
      {
        title: "项目",
        key: "project",
        render: (_: any, record: TIssue) => {
          const pid = String(record?.project_id ?? "");
          const p = projectsMap[pid];
          return (
            <div className="flex items-center gap-2">
              {p?.logo_props ? <Logo logo={p.logo_props} size={16} /> : null}
              <span className="truncate">{p?.name ?? pid ?? "-"}</span>
            </div>
          );
        },
      },
      {
        title: "操作",
        key: "actions",
        render: (_: any, record: TIssue) => (
          <Button danger type="link" onClick={() => handleRemoveSelected(record.id)}>
            删除
          </Button>
        ),
      },
    ],
    [projectsMap, projectIssueTypesMaps]
  );

  const resetForm = () => {
    form.resetFields();
    setSelectedIssues([]);
    setSubmitting(false);
  };

  const onCloseWithReset = () => {
    resetForm();
    handleClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    // 打开弹窗时同步初始值（仅创建模式）
    form.setFieldsValue({
      name: "",
      precondition: "",
      // 修正 steps 初始类型为数组且默认一行空数据
      steps: [{ description: "", result: "" }],
      remark: "",
      issues: "",
      repository: repositoryName || "",
      module: "",
      type: "",
      priority: "",
      test_type: "",
      assignee: "",
    });
  }, [isOpen, form, repositoryName]);

  // 新增：弹窗打开时拉取模块列表
  useEffect(() => {
    if (!isOpen || !workspaceSlug || !repositoryId) return;
    caseService
      .getModules(workspaceSlug, repositoryId)
      .then((list) => {
        const flat = flattenModules(list);
        setModuleOptions(flat.map((m) => ({ label: m.name, value: String(m.id) })));
      })
      .catch((err) => {
        const msg = err?.message || err?.detail || err?.error || "获取模块列表失败";
        message.error(msg);
        setModuleOptions([]);
      });
  }, [isOpen, workspaceSlug, repositoryId]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // 构造 payload：包含所有表单项（附件除外）
      const payload: any = {
        name: (values?.name || "").trim(),
        precondition: (values?.precondition || "").trim(),
        repository: repositoryId,
        remark: values?.remark || "",
        steps: Array.isArray(values?.steps)
          ? values.steps.map((s: any) => ({
              description: (s?.description || "").trim(),
              result: (s?.result || "").trim(),
            }))
          : [],
        // 新增：右侧与其它项的值全部带上（附件除外）
        assignee: values?.assignee || null,
        module: values?.module || null,
        type: values?.type || null,
        priority: values?.priority || null,
        test_type: values?.test_type || null,
        // 新增：工作项以 id 列表传递
        issues: Array.isArray(selectedIssues) ? selectedIssues.map((i) => i.id) : [],
        // 新增：标签 id 列表
        labels: labelList.map((l) => l.id),
      };

      if (!payload.name) {
        message.warning("请输入用例名称");
        setSubmitting(false);
        return;
      }

      // 若有附件仍在上传中，避免未完成上传的绑定
      const isAnyUploading = attachmentFiles.some((f) => attachmentUploading[`${f.name}-${f.size}-${f.lastModified}`]);
      if (isAnyUploading) {
        message.warning("有附件仍在上传中，请稍候再创建");
        setSubmitting(false);
        return;
      }

      const createdCase = await caseService.createCase(workspaceSlug, payload);
      message.success("测试用例创建成功");

      const caseId: string | undefined = createdCase?.id ?? createdCase?.case?.id;

      // 创建后批量绑定附件到用例（附件不在创建 payload 中）
      if (caseId && attachmentAssetIds.length > 0) {
        await caseService.post(`/api/assets/v2/workspaces/${workspaceSlug}/${caseId}/bulk/`, {
          asset_ids: attachmentAssetIds,
        });
      }

      await onSuccess?.();
      setAttachmentFiles([]);
      setAttachmentAssetIds([]);
      setAttachmentUploading({});
      // 重置标签列表
      setLabelList([]);
      setLabelInput("");
      onCloseWithReset();
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "操作失败，请稍后重试";
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onCancel={onCloseWithReset}
      title={title}
      width="75vw"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onCloseWithReset} disabled={submitting}>
            取消
          </Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
            data-testid="qa-case-submit"
          >
            创建
          </Button>
        </div>
      }
      destroyOnClose
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: "",
          precondition: "",
          steps: [{ description: "", result: "" }],
          remark: "",
          issues: "",
          repository: repositoryName || "",
          module: "",
          type: "",
          priority: "",
          test_type: "manual",
          assignee: "",
        }}
      >
        {/* 其余表单项与自定义组件保持不变 */}
        {/* 包括 QuillField 与 StepsEditor 的用法 */}
        {/* 左右布局、风格与已有设计体系保持一致 */}
        <div style={{ display: "flex", gap: 16, height: "75vh", alignItems: "stretch" }}>
          {/* 左侧区域 */}
          <div style={{ flex: 2, height: "100%", overflowY: "auto" }}>
            <Form.Item label={<span>标题</span>} name="name" rules={[{ required: true, message: "请输入标题" }]}>
              <Input placeholder="请输入标题" />
            </Form.Item>
            {/* 保留工作项回显表格与附件列表等 */}
            <Form.Item label="前置条件" name="precondition">
              <QuillField placeholder="请输入前置条件" />
            </Form.Item>

            <Form.Item label="用例步骤" name="steps">
              <StepsEditor />
            </Form.Item>

            <Form.Item label="备注" name="remark">
              <QuillField placeholder="请输入备注" />
            </Form.Item>

            <Form.Item
              label={
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span>工作项</span>
                  <Button
                    type="link"
                    icon={<PlusOutlined />}
                    onClick={() => setIsWorkItemModalOpen(true)}
                    style={{ marginLeft: "auto" }}
                  >
                    添加
                  </Button>
                </div>
              }
              name="issues"
            >
              {/* 保留工作项回显表格 */}
              {selectedIssues.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <WorkItemTable<TIssue>
                    data={selectedIssues}
                    loading={false}
                    columns={workItemColumns as any}
                    rowKey="id"
                    current={1}
                    pageSize={selectedIssues.length}
                    total={selectedIssues.length}
                  />
                </div>
              )}
            </Form.Item>

            {/* 新增：附件属性（位于“工作项”下面） */}
            <Form.Item label="附件">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Button type="default" icon={<PlusOutlined />} onClick={handlePickAttachments}>
                  选择文件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFilesChosen}
                />
              </div>
              {attachmentFiles.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {attachmentFiles.map((f, idx) => {
                      const key = `${f.name}-${f.size}-${f.lastModified}`;
                      const uploading = !!attachmentUploading[key];
                      return (
                        <li key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="truncate" style={{ maxWidth: 360 }}>
                            {f.name}
                          </span>
                          <span style={{ color: uploading ? "#faad14" : "#52c41a" }}>
                            {uploading ? "上传中..." : "已上传"}
                          </span>
                          <Button
                            size="small"
                            type="link"
                            danger
                            onClick={() => handleRemoveAttachment(idx)}
                            disabled={uploading}
                          >
                            删除
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Form.Item>
          </div>

          {/* 右侧区域 */}
          <div style={{ flex: 1 }} className="space-y-2">
            <Form.Item label="所属测试库" name="repository" className="mb-2">
              <Input placeholder="所属测试库" disabled />
            </Form.Item>

            <Form.Item
              label="维护人"
              name="assignee"
              rules={[{ required: true, message: "请选择维护人" }]}
              className="mb-2"
            >
              <Select
                placeholder="选择维护人"
                options={assigneeOptions}
                allowClear
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>

            {/* 将模块改为下拉框 */}
            <Form.Item label="模块" name="module" className="mb-2">
              <Select
                placeholder="请选择模块"
                options={moduleOptions}
                allowClear
                showSearch
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>

            <Form.Item label="用例类型" name="type" className="mb-2">
              <Select
                placeholder="请选择用例类型"
                options={caseTypeOptions}
                showSearch
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>

            <Form.Item label="优先级" name="priority" className="mb-2">
              <Select
                placeholder="请选择优先级"
                options={casePriorityOptions}
                showSearch
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>

            <Form.Item label="测试类型" name="test_type" className="mb-2">
              <Select
                placeholder="请选择测试类型"
                options={caseTestTypeOptions}
                showSearch
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>

            {/* 标签 */}
            <Form.Item label="标签" className="mb-2">
              <div
                className="flex flex-wrap items-center gap-2 min-h-[32px] p-1 border border-custom-border-200 rounded cursor-text bg-white"
                onClick={() => {
                  const input = document.getElementById("label-input");
                  input?.focus();
                }}
              >
                {/* 渲染已有的标签 */}
                {labelList.map((label) => (
                  <div
                    key={label.id}
                    className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs border border-blue-100 group"
                  >
                    <span>{label.name}</span>
                    <span
                      className="cursor-pointer opacity-50 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLabel(label.id);
                      }}
                    >
                      <LucideIcons.X size={12} />
                    </span>
                  </div>
                ))}

                {/* 输入框 */}
                <input
                  id="label-input"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateLabel();
                    }
                  }}
                  onBlur={handleCreateLabel}
                  placeholder={labelList.length === 0 ? "输入标签名称" : ""}
                  className="flex-1 min-w-[60px] outline-none text-sm bg-transparent"
                />
              </div>
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 新增：选择工作项独立模态组件调用 */}
      <WorkItemSelectModal
        isOpen={isWorkItemModalOpen}
        workspaceSlug={workspaceSlug}
        onClose={() => setIsWorkItemModalOpen(false)}
        onConfirm={handleWorkItemConfirm}
        // 新增：传入父组件的已选项实现回显
        initialSelectedIssues={selectedIssues}
      />
    </Modal>
  );
};
