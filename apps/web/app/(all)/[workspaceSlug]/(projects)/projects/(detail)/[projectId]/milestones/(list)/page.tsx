"use client";

import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, Popconfirm, Select, Table, Tag } from "antd";
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
  { label: "延期", color: "red" },
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
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({});
  const [nameQuery, setNameQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [milestoneModalMode, setMilestoneModalMode] = useState<"create" | "edit">("create");
  const [editingMilestone, setEditingMilestone] = useState<(Partial<IMilestone> & { id?: string }) | undefined>(
    undefined
  );

  const fetchData = async (page: number, size: number) => {
    if (!workspaceSlug || !projectId) return;
    setLoading(true);
    try {
      const trimmedName = nameQuery.trim();
      const res: any = await milestoneService.getMilestones(
        workspaceSlug as string,
        projectId as string,
        page,
        size,
        {
          ...(trimmedName ? { name__icontains: trimmedName } : {}),
          ...(stateFilter.length ? { state__in: stateFilter.join(",") } : {}),
        }
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
  }, [workspaceSlug, projectId, currentPage, pageSize, nameQuery, stateFilter]);

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

  const handleTableChange: TableProps<IMilestone>["onChange"] = (pagination, filters) => {
    const newPage = pagination.current || 1;
    const newPageSize = pagination.pageSize || 10;

    const nextStateFilter = Array.isArray(filters?.state)
      ? (filters.state as any[]).map((v) => String(v)).sort()
      : [];
    const currentStateFilterSorted = [...stateFilter].sort();
    const isStateFilterChanged =
      nextStateFilter.length !== currentStateFilterSorted.length ||
      nextStateFilter.some((v, i) => v !== currentStateFilterSorted[i]);

    if (isStateFilterChanged) {
      setStateFilter(nextStateFilter);
    }

    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
    }

    const nextPage = isStateFilterChanged || newPageSize !== pageSize ? 1 : newPage;
    if (nextPage !== currentPage) setCurrentPage(nextPage);
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

  const deleteMilestone = async (milestoneId: string) => {
    const ws = String(workspaceSlug ?? "");
    const pid = String(projectId ?? "");
    if (!ws || !pid || !milestoneId) return;

    const isLastRowOnPage = data.length === 1;

    setDeletingById((prev) => ({ ...prev, [milestoneId]: true }));
    try {
      await milestoneService.deleteMilestone(ws, pid, milestoneId);

      if (isLastRowOnPage && currentPage > 1) {
        setCurrentPage((prev) => Math.max(prev - 1, 1));
      } else {
        fetchData(currentPage, pageSize);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingById((prev) => ({ ...prev, [milestoneId]: false }));
    }
  };

  const columns: TableProps<IMilestone>['columns'] = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      filteredValue: nameQuery ? [nameQuery] : null,
      filterDropdown: ({ selectedKeys, setSelectedKeys, confirm, clearFilters }) => (
        <div className="p-2 w-[260px]">
          <Input
            value={String(selectedKeys?.[0] ?? "")}
            placeholder="按名称搜索"
            allowClear
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => {
              const next = String(selectedKeys?.[0] ?? "");
              setNameQuery(next);
              setCurrentPage(1);
              confirm({ closeDropdown: true });
            }}
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              size="small"
              onClick={() => {
                clearFilters?.();
                setNameQuery("");
                setCurrentPage(1);
                confirm({ closeDropdown: true });
              }}
            >
              重置
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                const next = String(selectedKeys?.[0] ?? "");
                setNameQuery(next);
                setCurrentPage(1);
                confirm({ closeDropdown: true });
              }}
            >
              搜索
            </Button>
          </div>
        </div>
      ),
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
      filters: STATE_OPTIONS.map((o) => ({ text: o.label, value: o.label })),
      filterMultiple: true,
      filteredValue: stateFilter.length ? stateFilter : null,
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
        const id = String(record.id);
        const isDeleting = !!deletingById[id];
        return (
          <div className="flex items-center gap-2">
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
            <Popconfirm
              title="确定删除该里程碑吗？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true, loading: isDeleting }}
              onConfirm={(e) => {
                e?.stopPropagation?.();
                return deleteMilestone(id);
              }}
              onCancel={(e) => {
                e?.stopPropagation?.();
              }}
            >
              <Button
                type="link"
                danger
                className="!p-0"
                loading={isDeleting}
                onClick={(e) => {
                  e?.stopPropagation?.();
                }}
              >
                删除
              </Button>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHead title="Milestones" />
      <div className="flex h-full w-full flex-col min-h-0">
        <div className="vertical-scrollbar scrollbar-md flex-1 min-h-0">
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
