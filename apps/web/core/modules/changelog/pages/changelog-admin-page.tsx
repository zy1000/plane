import { useEffect, useMemo, useState } from "react";
import { Search, SquarePen, Trash2 } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader, Table } from "@plane/ui";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { UserService } from "@/services/user.service";
import { ChangelogFormModal } from "../components/changelog-form-modal";
import { changelogService } from "../services/changelog.service";
import type { IChangelogItem, TChangelogUpdateType } from "../types";

type Props = {
  workspaceSlug: string;
};

const userService = new UserService();

const TYPE_LABEL: Record<TChangelogUpdateType, string> = {
  added: "新增",
  fixed: "修复",
  improved: "优化",
};

export const ChangelogAdminPage = ({ workspaceSlug }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminLoading, setIsAdminLoading] = useState(true);
  const [isInstanceAdmin, setIsInstanceAdmin] = useState(false);
  const [items, setItems] = useState<IChangelogItem[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | TChangelogUpdateType>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<IChangelogItem | null>(null);
  const pageSize = 10;

  const fetchInstanceAdminStatus = async () => {
    try {
      const response = await userService.currentUserInstanceAdminStatus();
      setIsInstanceAdmin(Boolean(response?.is_instance_admin));
    } finally {
      setIsAdminLoading(false);
    }
  };

  const fetchList = async () => {
    setIsLoading(true);
    try {
      const response = await changelogService.getChangelogList({
        page,
        page_size: pageSize,
        search: search || undefined,
        update_type: typeFilter || undefined,
        include_inactive: true,
      });
      setItems(response?.data ?? []);
      setCount(response?.count ?? 0);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "加载失败",
        message: "更新日志列表加载失败，请稍后重试",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInstanceAdminStatus();
  }, []);

  useEffect(() => {
    if (!isInstanceAdmin) return;
    fetchList();
  }, [isInstanceAdmin, page, typeFilter]);

  const handleSearch = async () => {
    setPage(1);
    await fetchList();
  };

  const handleCreateOrUpdate = async (payload: any) => {
    try {
      if (editingItem?.id) await changelogService.updateChangelog(editingItem.id, payload);
      else await changelogService.createChangelog(payload);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: editingItem?.id ? "更新成功" : "创建成功",
        message: editingItem?.id ? "更新日志已更新" : "更新日志已创建",
      });
      setEditingItem(null);
      setIsModalOpen(false);
      await fetchList();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "保存失败",
        message: "请检查表单后重试",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确认删除该日志吗？")) return;
    await changelogService.deleteChangelog(id);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "删除成功",
      message: "更新日志已删除",
    });
    await fetchList();
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 条日志吗？`)) return;
    await changelogService.batchDeleteChangelog(selectedIds);
    setSelectedIds([]);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "批量删除成功",
      message: "已删除选中日志",
    });
    await fetchList();
  };

  const columns = useMemo(
    () => [
      {
        key: "select",
        content: "",
        tdRender: (row: IChangelogItem) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(row.id)}
            onChange={(e) =>
              setSelectedIds((prev) => (e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)))
            }
          />
        ),
      },
      {
        key: "version",
        content: "版本",
        tdRender: (row: IChangelogItem) => <span className="text-xs">{row.version}</span>,
      },
      {
        key: "title",
        content: "标题",
        tdRender: (row: IChangelogItem) => <span className="text-sm">{row.title}</span>,
      },
      {
        key: "type",
        content: "类型",
        tdRender: (row: IChangelogItem) => <span className="text-xs">{TYPE_LABEL[row.update_type]}</span>,
      },
      {
        key: "release_date",
        content: "发布时间",
        tdRender: (row: IChangelogItem) => (
          <span className="text-xs">{row.release_date ? new Date(row.release_date).toLocaleString() : "-"}</span>
        ),
      },
      {
        key: "actions",
        content: "操作",
        tdRender: (row: IChangelogItem) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-custom-text-200 hover:text-custom-text-100"
              onClick={() => {
                setEditingItem(row);
                setIsModalOpen(true);
              }}
            >
              <SquarePen className="size-4" />
            </button>
            <button
              type="button"
              className="text-red-500 hover:text-red-600"
              onClick={() => {
                handleDelete(row.id);
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ),
      },
    ],
    [selectedIds]
  );

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  if (isAdminLoading) {
    return (
      <SettingsContentWrapper>
        <Loader>
          <Loader.Item height="120px" />
        </Loader>
      </SettingsContentWrapper>
    );
  }

  if (!isInstanceAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper>
      <ChangelogFormModal
        isOpen={isModalOpen}
        workspaceSlug={workspaceSlug}
        workspaceId={currentWorkspace?.id}
        initialValue={editingItem}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleCreateOrUpdate}
      />
      <div className="w-full">
        <SettingsHeading
          title="更新日志管理"
          description="管理系统更新日志，支持筛选、编辑与删除"
          button={{
            label: "新增日志",
            onClick: () => {
              setEditingItem(null);
              setIsModalOpen(true);
            },
          }}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded border border-custom-border-200 px-2 py-1.5">
            <Search className="size-4 text-custom-text-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索标题或内容"
              className="bg-transparent text-sm outline-none"
            />
          </div>
          <select
            className="h-9 rounded border border-custom-border-200 bg-custom-background-100 px-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | TChangelogUpdateType)}
          >
            <option value="">全部类型</option>
            <option value="added">新增</option>
            <option value="fixed">修复</option>
            <option value="improved">优化</option>
          </select>
          <button
            type="button"
            className="rounded border border-custom-border-200 px-3 py-1.5 text-sm"
            onClick={handleSearch}
          >
            查询
          </button>
          <button
            type="button"
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
            onClick={handleBatchDelete}
            disabled={!selectedIds.length}
          >
            批量删除
          </button>
        </div>
        {isLoading ? (
          <Loader>
            <Loader.Item height="200px" />
          </Loader>
        ) : (
          <div className="rounded border border-custom-border-200">
            <Table
              columns={columns}
              data={items}
              keyExtractor={(rowData) => rowData.id}
              tHeadClassName="border-b border-custom-border-100"
              thClassName="text-left font-medium text-custom-text-400"
              tBodyClassName="divide-y-0"
              tBodyTrClassName="h-[42px] text-custom-text-200"
            />
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded border border-custom-border-200 px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((prev) => prev - 1)}
          >
            上一页
          </button>
          <span className="text-sm text-custom-text-300">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded border border-custom-border-200 px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </SettingsContentWrapper>
  );
};
