"use client";
/**
 * 用例详情弹窗「关联需求」tab 的列表面板。
 *
 * ⚠️ 与同目录的 work-item-display-modal 不是一回事：那个挂的是**工作项**（含 IssueType
 * 名为 史诗/特性/用户故事 的那些，界面上也叫"需求"），这个挂的是 requirement 域的**真需求**
 * （RequirementTestCase 关联表）。两者并存，别合并。
 *
 * 端点是项目作用域的（吃 QA_CASE_* 权限）。**共享用例库（repository.project 为空）的用例
 * 只能从需求侧关联** —— 项目级权限键在 project 为空时必然 403，见
 * apps/api/plane/app/views/qa/case_requirement.py 的说明。
 *
 * 风格跟随 components/qa/**：antd + 硬编码中文（该目录没有任何 i18n 命名空间）。
 */
import React from "react";
import { Table, Button, Spin, Popconfirm, message } from "antd";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Unlink } from "lucide-react";
import type { ColumnsType } from "antd/es/table";
import type { TTestCaseRequirementLink } from "@plane/types";
import { CaseService } from "../../../services/qa/case.service";

const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  not_started: "未开始",
  projected: "已立项",
  in_progress: "进行中",
  released: "已发布",
  closed: "已关闭",
};

type RequirementDisplayPanelProps = {
  caseId: string;
  /** 显式传入优先于路由参数 —— 用例弹窗也可能从非项目路由（如工作项详情）打开 */
  projectId?: string;
  className?: string;
  reloadToken?: number;
  onCountChange?: (n: number) => void;
  /** 无编辑权限时不渲染解除按钮 */
  canEdit?: boolean;
};

export const RequirementDisplayPanel: React.FC<RequirementDisplayPanelProps> = ({
  caseId,
  projectId: propProjectId,
  className,
  reloadToken,
  onCountChange,
  canEdit = true,
}) => {
  const params = useParams() as { workspaceSlug?: string; projectId?: string };
  const workspaceSlug = params.workspaceSlug ? String(params.workspaceSlug) : "";
  const projectId = propProjectId || (params.projectId ? String(params.projectId) : "");
  const caseService = React.useMemo(() => new CaseService(), []);

  const [loading, setLoading] = React.useState<boolean>(false);
  const [rows, setRows] = React.useState<TTestCaseRequirementLink[]>([]);
  const [pageSize, setPageSize] = React.useState<number>(10);
  const [currentPage, setCurrentPage] = React.useState<number>(1);

  const fetchRequirements = React.useCallback(async () => {
    if (!workspaceSlug || !projectId || !caseId) return;
    setLoading(true);
    try {
      const res = await caseService.getCaseRequirements(workspaceSlug, projectId, caseId);
      const resolved = Array.isArray(res) ? res : [];
      setRows(resolved);
      onCountChange?.(resolved.length);
      setCurrentPage(1);
    } catch {
      setRows([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
    // onCountChange 由父级每次渲染重建，进依赖会导致死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, caseService, projectId, workspaceSlug]);

  React.useEffect(() => {
    void fetchRequirements();
  }, [fetchRequirements, reloadToken]);

  const handleUnlink = async (requirementId: string) => {
    if (!workspaceSlug || !projectId || !caseId) return;
    try {
      await caseService.deleteCaseRequirement(workspaceSlug, projectId, caseId, requirementId);
      message.success("取消关联成功");
      void fetchRequirements();
    } catch {
      message.error("取消关联失败");
    }
  };

  const columns: ColumnsType<TTestCaseRequirementLink> = React.useMemo(() => {
    const base: ColumnsType<TTestCaseRequirementLink> = [
      {
        title: "编号",
        dataIndex: "requirement_display_id",
        key: "requirement_display_id",
        width: 140,
        render: (_: any, record) => <span className="text-secondary">{record.requirement_display_id ?? "-"}</span>,
      },
      {
        title: "需求名称",
        dataIndex: "requirement_name",
        key: "requirement_name",
        render: (_: any, record) => {
          // 需求详情整页在产品作用域下；product_id 缺失（历史行）时退化为纯文本
          if (!record.product_id) return <span>{record.requirement_name}</span>;
          return (
            <Link
              href={`/${workspaceSlug}/products/${record.product_id}/requirements/${record.requirement_id}`}
              className="text-blue-600 hover:underline"
            >
              {record.requirement_name}
            </Link>
          );
        },
      },
      {
        title: "状态",
        dataIndex: "requirement_status",
        key: "requirement_status",
        width: 140,
        render: (_: any, record) => (
          <span>{REQUIREMENT_STATUS_LABELS[record.requirement_status] ?? record.requirement_status}</span>
        ),
      },
    ];

    if (canEdit) {
      base.push({
        title: "操作",
        key: "action",
        width: 100,
        render: (_: any, record) => (
          <Popconfirm
            title="确认取消关联?"
            onConfirm={() => handleUnlink(record.requirement_id)}
            okText="确认"
            cancelText="取消"
            // 同 requirement-select-modal：外层用例详情弹窗是 z-[1100] 的裸 portal，
            // 不是 antd Modal，所以 antd 的 zIndex 上下文接不上，popup 默认层级会被盖住
            zIndex={1250}
          >
            <Button type="text" icon={<Unlink size={16} />} />
          </Popconfirm>
        ),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, workspaceSlug, projectId, caseId]);

  return (
    <div className={className}>
      <Spin spinning={loading} delay={200}>
        <Table<TTestCaseRequirementLink>
          size="small"
          rowKey="requirement_id"
          loading={loading}
          dataSource={rows}
          columns={columns as any}
          pagination={{
            current: currentPage,
            pageSize,
            total: rows.length,
            showSizeChanger: true,
            showQuickJumper: true,
            onChange: (page) => setCurrentPage(page),
            onShowSizeChange: (_current, size) => setPageSize(size),
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          }}
        />
      </Spin>
    </div>
  );
};

export default RequirementDisplayPanel;
