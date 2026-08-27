"use client";
/**
 * 用例侧「添加需求」选择器。
 *
 * ⚠️ 与同目录的 work-item-select-modal 不是一回事：那个选的是**工作项**，这个选的是
 * requirement 域的**真需求**。
 *
 * 候选池 = 用例库所属项目下已关联的需求（非 closed、product 归属），由服务端判定
 * （utils/requirement_test_case.linkable_requirements_for_case_queryset），前端不做二次过滤。
 *
 * 风格跟随 components/qa/**：antd + 硬编码中文。分页用后端游标（形状 "limit:page:is_prev"，
 * 见 utils/paginator.py），不是行偏移。
 */
import React from "react";
import { Modal, Table, Input, message } from "antd";
import { useParams } from "next/navigation";
import type { ColumnsType, TableRowSelection } from "antd/es/table";
import type { TLinkableCaseRequirement } from "@plane/types";
import useDebounce from "@/hooks/use-debounce";
import { CaseService } from "../../../services/qa/case.service";

const PAGE_SIZE = 20;

const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  not_started: "未开始",
  projected: "已立项",
  in_progress: "进行中",
  released: "已发布",
  closed: "已关闭",
};

type RequirementSelectModalProps = {
  isOpen: boolean;
  caseId: string;
  /** 显式传入优先于路由参数 —— 用例弹窗也可能从非项目路由（如工作项详情）打开 */
  projectId?: string;
  onClose: () => void;
  /** 返回后由调用方刷新已关联列表并提示 */
  onConfirm: (requirementIds: string[]) => Promise<void>;
};

export const RequirementSelectModal: React.FC<RequirementSelectModalProps> = ({
  isOpen,
  caseId,
  projectId: propProjectId,
  onClose,
  onConfirm,
}) => {
  const params = useParams() as { workspaceSlug?: string; projectId?: string };
  const workspaceSlug = params.workspaceSlug ? String(params.workspaceSlug) : "";
  const projectId = propProjectId || (params.projectId ? String(params.projectId) : "");
  const caseService = React.useMemo(() => new CaseService(), []);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [rows, setRows] = React.useState<TLinkableCaseRequirement[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);

  /** 请求序号：搜索词变化很快，慢的那次响应可能后到并覆盖新结果，只认最后一次 */
  const requestSequenceRef = React.useRef(0);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchRows = React.useCallback(
    async (nextPage: number) => {
      if (!isOpen || !workspaceSlug || !projectId || !caseId) return;
      const requestSequence = ++requestSequenceRef.current;
      setLoading(true);
      try {
        const res = await caseService.getLinkableRequirements(workspaceSlug, projectId, caseId, {
          search: debouncedSearchTerm,
          per_page: PAGE_SIZE,
          // 后端游标是 0-based 页序号，antd 分页是 1-based
          cursor: `${PAGE_SIZE}:${nextPage - 1}:0`,
        });
        if (requestSequence !== requestSequenceRef.current) return;
        setRows(res?.results ?? []);
        setTotal(Number(res?.total_count ?? 0));
        setPage(nextPage);
      } catch {
        if (requestSequence !== requestSequenceRef.current) return;
        setRows([]);
        setTotal(0);
      } finally {
        if (requestSequence === requestSequenceRef.current) setLoading(false);
      }
    },
    [caseId, caseService, debouncedSearchTerm, isOpen, projectId, workspaceSlug]
  );

  // 搜索词变化回到第一页；关闭时重置全部状态
  React.useEffect(() => {
    if (!isOpen) return;
    void fetchRows(1);
  }, [fetchRows, isOpen]);

  React.useEffect(() => {
    if (isOpen) return;
    requestSequenceRef.current += 1;
    setSearchTerm("");
    setRows([]);
    setSelectedIds([]);
    setPage(1);
    setTotal(0);
    setLoading(false);
  }, [isOpen]);

  const columns: ColumnsType<TLinkableCaseRequirement> = React.useMemo(
    () => [
      {
        title: "编号",
        dataIndex: "display_id",
        key: "display_id",
        width: 140,
        render: (_: any, record) => <span className="text-secondary">{record.display_id ?? "-"}</span>,
      },
      { title: "需求名称", dataIndex: "name", key: "name" },
      {
        title: "所属产品",
        dataIndex: "product_name",
        key: "product_name",
        width: 180,
        render: (_: any, record) => <span>{record.product_name ?? "-"}</span>,
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (_: any, record) => <span>{REQUIREMENT_STATUS_LABELS[record.status] ?? record.status}</span>,
      },
    ],
    []
  );

  /**
   * preserveSelectedRowKeys 让跨分页/跨搜索的勾选不丢 —— 翻页时 dataSource 整体换掉，
   * 不保留的话上一页勾的会被静默清空。
   */
  const rowSelection: TableRowSelection<TLinkableCaseRequirement> = {
    selectedRowKeys: selectedIds,
    preserveSelectedRowKeys: true,
    onChange: (keys) => setSelectedIds(keys.map((key) => String(key))),
  };

  const handleConfirm = async () => {
    if (!selectedIds.length) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedIds);
      onClose();
    } catch (error) {
      const payload = error as { code?: string; error?: string; conflicts?: { reason?: string }[] } | null;
      // 「不能关联」不可行动，「这条需求不在本用例库的项目范围里」才可行动
      if (payload?.code === "REQUIREMENT_TEST_CASE_LINK_REJECTED" && payload.conflicts?.length) {
        const reason = payload.conflicts[0].reason;
        message.error(
          reason === "PROJECT_OUT_OF_SCOPE"
            ? "有需求不在本用例库所属项目的范围内，请先把需求关联进该项目"
            : reason === "CLOSED"
              ? "有需求已关闭，不能新建关联"
              : "关联需求失败"
        );
      } else {
        message.error(payload?.error ?? "关联需求失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      title="添加需求"
      width={900}
      onCancel={onClose}
      onOk={() => void handleConfirm()}
      okText={selectedIds.length ? `确认 · ${selectedIds.length}` : "确认"}
      cancelText="取消"
      okButtonProps={{ disabled: !selectedIds.length, loading: submitting }}
      // 用例详情弹窗自己是 z-[1100] 的 portal，antd Modal 默认 zIndex 1000 会被它盖住。
      // 1250 与同目录的 work-item-select-modal 对齐，别改小
      zIndex={1250}
      maskClosable={false}
      destroyOnHidden
    >
      <div className="mb-3">
        <Input.Search
          allowClear
          placeholder="搜索需求名称"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>
      <Table<TLinkableCaseRequirement>
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns as any}
        rowSelection={rowSelection}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (nextPage) => void fetchRows(nextPage),
          showTotal: (count) => `共 ${count} 条`,
        }}
      />
    </Modal>
  );
};

export default RequirementSelectModal;
