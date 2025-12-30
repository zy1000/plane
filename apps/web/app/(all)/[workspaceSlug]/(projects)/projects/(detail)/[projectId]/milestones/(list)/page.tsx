"use client";

import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Select, Table, Tag } from "antd";
import type { TableProps } from "antd";

// components
import { PageHead } from "@/components/core/page-title";

// services
import { MilestoneService, type IMilestone } from "@/services/milestone.service";
import { MilestoneCreateUpdateModal } from "./milestone-create-update-modal";

const milestoneService = new MilestoneService();
const getMilestoneNameCacheKey = (workspaceSlug: string, projectId: string, milestoneId: string) =>
  `milestoneName:${workspaceSlug}:${projectId}:${milestoneId}`;

const OPEN_MILESTONE_MODAL_EVENT = "milestones:list:milestone-modal:open";

const STATE_OPTIONS = [
  { label: "未开始", color: "gray" },
  { label: "进行中", color: "blue" },
  { label: "延期", color: "yellow" },
  { label: "已完成", color: "green" },
];

function ProjectMilestonesPage() {
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IMilestone[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [updatingStateById, setUpdatingStateById] = useState<Record<string, boolean>>({});
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [milestoneModalMode, setMilestoneModalMode] = useState<"create" | "edit">("create");
  const [editingMilestone, setEditingMilestone] = useState<(Partial<IMilestone> & { id?: string }) | undefined>(
    undefined
  );

  const fetchData = async (page: number, size: number) => {
    if (!workspaceSlug || !projectId) return;
    setLoading(true);
    try {
      const res: any = await milestoneService.getMilestones(
        workspaceSlug as string,
        projectId as string,
        page,
        size
      );
      
      // Handle different possible response structures
      if (res && Array.isArray(res.results)) {
        setData(res.results);
        setTotal(res.count || 0);
      } else if (res && Array.isArray(res.data)) {
        setData(res.data);
        setTotal(res.count || res.total_count || 0);
      } else if (Array.isArray(res)) {
        setData(res);
        setTotal(res.length);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(currentPage, pageSize);
  }, [workspaceSlug, projectId, currentPage, pageSize]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as
        | { mode?: "create" | "edit"; milestone?: Partial<IMilestone> & { id?: string } }
        | undefined;
      const mode = detail?.mode ?? "create";
      setMilestoneModalMode(mode);
      setEditingMilestone(mode === "edit" ? detail?.milestone : undefined);
      setMilestoneModalOpen(true);
    };

    window.addEventListener(OPEN_MILESTONE_MODAL_EVENT, handler as EventListener);
    return () => window.removeEventListener(OPEN_MILESTONE_MODAL_EVENT, handler as EventListener);
  }, []);

  const handleTableChange: TableProps<IMilestone>['onChange'] = (pagination) => {
    const newPage = pagination.current || 1;
    const newPageSize = pagination.pageSize || 10;
    
    // Only update state if values changed to avoid loop (though useEffect dep handles it)
    if (newPage !== currentPage || newPageSize !== pageSize) {
      setCurrentPage(newPage);
      setPageSize(newPageSize);
    }
  };

  const updateMilestoneState = async (milestoneId: string, nextState: string) => {
    const ws = String(workspaceSlug ?? "");
    const pid = String(projectId ?? "");
    if (!ws || !pid || !milestoneId) return;

    const nextColor = STATE_OPTIONS.find((o) => o.label === nextState)?.color ?? null;

    setUpdatingStateById((prev) => ({ ...prev, [milestoneId]: true }));
    try {
      await milestoneService.updateMilestone(ws, pid, milestoneId, {
        project_id: pid,
        state: nextState,
        state_color: nextColor,
      });

      setData((prev) =>
        prev.map((m) => (String(m.id) === String(milestoneId) ? { ...m, state: nextState, state_color: nextColor } : m))
      );
      fetchData(currentPage, pageSize);
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingStateById((prev) => ({ ...prev, [milestoneId]: false }));
    }
  };

  const columns: TableProps<IMilestone>['columns'] = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: IMilestone) => {
        if (!record?.id) return name ?? "-";
        return (
          <Button
            type="link"
            className="!p-0"
            onClick={() => {
              const ws = String(workspaceSlug ?? "");
              const pid = String(projectId ?? "");
              const mid = String(record.id ?? "");
              if (ws && pid && mid) {
                try {
                  window.sessionStorage.setItem(getMilestoneNameCacheKey(ws, pid, mid), name ?? "");
                } catch {}
              }
              router.push(`/${ws}/projects/${pid}/milestones/${encodeURIComponent(mid)}`);
            }}
          >
            <span className="truncate">{name}</span>
          </Button>
        );
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      render: (_: any, record: IMilestone) => {
        const id = String(record?.id ?? "");
        const state = record?.state ?? undefined;
        if (!id) return "-";

        const isUpdating = !!updatingStateById[id];
        const options = STATE_OPTIONS.map((o) => ({
          value: o.label,
          label: (
            <Tag className="m-0" color={o.color}>
              {o.label}
            </Tag>
          ),
        }));

        return (
          <Select
            value={state}
            options={options}
            style={{ width: 120 }}
            bordered={false}
            suffixIcon={null}
            disabled={isUpdating}
            loading={isUpdating}
            onChange={(val) => updateMilestoneState(id, val)}
          />
        );
      },
    },
    {
      title: '开始日期',
      dataIndex: 'start_date',
      key: 'start_date',
    },
    {
      title: '结束日期',
      dataIndex: 'end_date',
      key: 'end_date',
    },
    {
      title: '完成率',
      dataIndex: 'completion_rate',
      key: 'completion_rate',
      render: (text) => text ? `${text}` : '-'
    },
    {
      title: "操作",
      key: "actions",
      render: (_: any, record: IMilestone) => {
        if (!record?.id) return "-";
        return (
          <Button
            type="link"
            className="!p-0"
            onClick={(e) => {
              e?.stopPropagation?.();
              setMilestoneModalMode("edit");
              setEditingMilestone(record);
              setMilestoneModalOpen(true);
            }}
          >
            编辑
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <PageHead title="Milestones" />
      <div className="flex h-full w-full flex-col">
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
        />
      </div>
      <MilestoneCreateUpdateModal
        open={milestoneModalOpen}
        mode={milestoneModalMode}
        initialValues={editingMilestone}
        onCancel={() => {
          setMilestoneModalOpen(false);
          setEditingMilestone(undefined);
          setMilestoneModalMode("create");
        }}
        onSuccess={() => {
          setMilestoneModalOpen(false);
          setEditingMilestone(undefined);
          setMilestoneModalMode("create");
          fetchData(currentPage, pageSize);
        }}
      />
    </>
  );
}

export default observer(ProjectMilestonesPage);
