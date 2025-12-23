// 文件顶部 imports
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Checkbox, Spin, Empty, Tag, message, Input, Table, Space } from "antd";
import type { TPartialProject, TIssue, TIssuesResponse } from "@plane/types";
import { IssueService } from "@/services/issue/issue.service";
import { ProjectIssueTypeService, projectIssueTypesCache, type TIssueType } from "@/services/project";
import { CaseService } from "@/services/qa/case.service";
import * as LucideIcons from "lucide-react";
// 新增：复用状态下拉组件，保持与工作项详情侧栏一致的风格
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { SearchOutlined } from "@ant-design/icons";
import type { TableProps, InputRef, TableColumnType } from "antd";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useParams } from "next/navigation";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  onClose: () => void;
  onConfirm: (issues: TIssue[]) => void;
  initialSelectedIssues?: TIssue[];
  forceTypeName?: "Requirement" | "Task" | "Bug";
  caseId?: string;
};

export const WorkItemSelectModal: React.FC<Props> = ({
  isOpen,
  workspaceSlug,
  onClose,
  onConfirm,
  initialSelectedIssues,
  forceTypeName,
  caseId,
}) => {
  const { projectId } = useParams();
  const currentProjectId = projectId?.toString();

  const issueService = useMemo(() => new IssueService(), []);
  const caseService = useMemo(() => new CaseService(), []);
  const { fetchProjectStates, getStateById } = useProjectState();

  const [issues, setIssues] = useState<TIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  // 选择项
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  // 新增：跨项目、跨分页持久化选中项映射
  const [selectedIssuesMap, setSelectedIssuesMap] = useState<Record<string, TIssue>>({});
  // 新增：表格过滤状态（前端受控）
  const [filters, setFilters] = useState<{
    name?: string;
    state?: string[]; // state_id
    type_id?: string[]; // type_id
  }>({});

  // 名称搜索（复用参考页逻辑）
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = React.useRef<InputRef>(null);

  // 复用搜索下拉
  const getColumnSearchProps = (dataIndex: keyof TIssue | string): TableColumnType<TIssue> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`搜索 ${dataIndex === "name" ? "名称" : "文本"}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], dataIndex, confirm)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], dataIndex, confirm)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            搜索
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters, dataIndex, confirm)}
            size="small"
            style={{ width: 90 }}
          >
            重置
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    onFilterDropdownOpenChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
    // 受控的过滤值
    filteredValue: dataIndex === "name" ? (filters.name ? [filters.name] : null) : null,
    // 前端过滤函数
    onFilter: (value, record) =>
      dataIndex === "name" ? (record?.name || "").toLowerCase().includes(String(value).toLowerCase()) : true,
  });

  const handleSearch = (selectedKeys: string[], dataIndex: keyof TIssue | string, confirm?: () => void) => {
    setSearchText(selectedKeys[0]);
    setSearchedColumn(String(dataIndex));
    const next = { ...filters };
    if (selectedKeys[0]) {
      if (dataIndex === "name") next.name = selectedKeys[0];
    } else {
      if (dataIndex === "name") delete next.name;
    }
    setFilters(next);
    confirm?.();
  };

  const handleReset = (clearFilters: () => void, dataIndex: keyof TIssue | string, confirm?: () => void) => {
    clearFilters();
    setSearchText("");
    const next = { ...filters };
    if (dataIndex === "name") delete next.name;
    setFilters(next);
    confirm?.();
  };

  const [projectSearch, setProjectSearch] = useState<string>("");

  const issueTypeService = useMemo(() => new ProjectIssueTypeService(), []);
  const [projectIssueTypesMap, setProjectIssueTypesMap] = useState<Record<string, TIssueType> | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || !currentProjectId) {
      setProjectIssueTypesMap(undefined);
      return;
    }
    issueTypeService
      .fetchProjectIssueTypes(workspaceSlug, currentProjectId)
      .then(() => {
        // 使用缓存的映射
        setProjectIssueTypesMap(projectIssueTypesCache.get(currentProjectId));
      })
      .catch(() => {
        setProjectIssueTypesMap(undefined);
      });
  }, [isOpen, workspaceSlug, currentProjectId, issueTypeService]);

  const displayIssues = useMemo(
    () => issues,
    [issues]
  );

  // 渲染类型图标（参考 issue-detail.tsx 逻辑）
  const renderIssueTypeIcon = (record: TIssue) => {
    // 兼容 record.type 为对象的情况
    const typeObj = (record as any)?.type;
    const typeId = typeObj?.id || (record as any)?.type_id;

    if (typeObj && typeObj.logo_props?.icon) {
      const { name, color, background_color } = typeObj.logo_props.icon;
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
          aria-label={`Issue type: ${typeObj.name}`}
        >
          {IconComp ? (
            <IconComp className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <LucideIcons.Layers className="h-3.5 w-3.5" />
          )}
        </span>
      );
    }

    const map = projectIssueTypesMap;
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
    // 映射为空或无图标配置时的兜底
    return <LucideIcons.Layers className="h-3.5 w-3.5" />;
  };
  // 新增：Table 列定义（展示名称与状态）
  const columns = useMemo(
    () => {
      const baseList = displayIssues;
      // 构建状态过滤器选项
      const stateMap = new Map<string, string>();
      baseList.forEach((i: any) => {
        const id = i.state?.id || i.state_id;
        if (id) {
          // 优先使用记录中的名称，其次从 store 获取，最后使用 ID
          const name = i.state?.name || getStateById(id)?.name || id;
          stateMap.set(id, name);
        }
      });
      const stateFilters = Array.from(stateMap.entries()).map(([value, text]) => ({ text, value }));

      // 构建类型过滤器选项
      const typeMap = new Map<string, string>();
      // 先加载所有项目类型（如果存在映射）
      if (projectIssueTypesMap) {
        Object.values(projectIssueTypesMap).forEach((t) => {
          if (t.id) typeMap.set(t.id, t.name);
        });
      }
      // 补充当前列表中可能存在的类型（兼容跨项目或无映射情况）
      baseList.forEach((i: any) => {
        const id = i.type?.id || i.type_id;
        if (id) {
          const name = i.type?.name || projectIssueTypesMap?.[id]?.name || id;
          typeMap.set(id, name);
        }
      });
      const typeFilters = Array.from(typeMap.entries()).map(([value, text]) => ({ text, value }));

      return [
        {
          title: "名称",
          dataIndex: "name",
          key: "name",
          ...getColumnSearchProps("name"),
        },
        {
          title: "状态",
          key: "state_id",
          dataIndex: "state_id",
          render: (_: any, record: TIssue) => (
            <StateDropdown
              value={(record as any)?.state?.id || record?.state_id || ""}
              onChange={async (val) => {
                try {
                  await issueService.patchIssue(workspaceSlug, record.project_id as string, record.id as string, {
                    state_id: val,
                  });
                  setIssues((prev) => prev.map((i) => (i.id === record.id ? { ...i, state_id: val } : i)));
                  message.success("状态已更新");
                } catch (err: any) {
                  message.error(`更新状态失败：${err?.message || "未知错误"}`);
                }
              }}
              projectId={record?.project_id?.toString() ?? ""}
              disabled={true}
              buttonVariant="transparent-with-text"
              className="group w-full"
              buttonContainerClassName="w-full text-left"
              buttonClassName="text-xs"
              dropdownArrow
            />
          ),
          // 修复：过滤项显示状态名称而不是 id
          filters: stateFilters,
          filterMultiple: true,
          filteredValue: filters.state ?? null,
          onFilter: (value: any, record: any) => {
            const id = record?.state?.id || record?.state_id;
            return String(id) === String(value);
          },
          width: 140,
        },
        {
          title: "类型",
          key: "type_id",
          dataIndex: "type_id",
          render: (_: any, record: TIssue) => {
            // 优先使用 record.type 对象
            const typeObj = (record as any)?.type;
            if (typeObj) {
              return (
                <div className="flex items-center gap-2">
                  {renderIssueTypeIcon(record)}
                  <span className="truncate">{typeObj.name ?? "-"}</span>
                </div>
              );
            }
            // 回退到 type_id + map
            const typeId = record?.type_id || undefined;
            const map = projectIssueTypesMap;
            const typeName = typeId && map ? map[typeId]?.name : undefined;
            return (
              <div className="flex items-center gap-2">
                {renderIssueTypeIcon(record)}
                <span className="truncate">{typeName ?? "-"}</span>
              </div>
            );
          },
          // 修复：类型过滤项展示“当前项目下的全部类型”
          filters: typeFilters,
          filterMultiple: true,
          filteredValue: filters.type_id ?? null,
          onFilter: (value: any, record: any) => {
            const id = record?.type?.id || record?.type_id;
            return String(id) === String(value);
          },
          width: 140,
        },
      ];
    },
    // 依赖中加入 getStateById，确保状态名称变化时列配置更新
    [displayIssues, filters, projectIssueTypesMap, workspaceSlug, issueService, getStateById]
  );

  // 表格 onChange：同步 filters（受控）
  const handleTableChange: TableProps<TIssue>["onChange"] = (_pagination, tableFilters) => {
    const selectedStates = (tableFilters?.state_id as string[] | undefined) || [];
    const selectedTypes = (tableFilters?.type_id as string[] | undefined) || [];
    setFilters((prev) => ({
      ...prev,
      state: selectedStates.length ? selectedStates.map(String) : undefined,
      type_id: selectedTypes.length ? selectedTypes.map(String) : undefined,
    }));
  };

  // 新增：Table 多选（保持原逻辑）
  const rowSelection = {
    selectedRowKeys: Array.from(selectedIssueIds),
    onSelect: (record: TIssue, selected: boolean) => {
      const id = String(record.id);
      setSelectedIssueIds((prev) => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });
      setSelectedIssuesMap((prev) => {
        const next = { ...prev };
        if (selected) next[id] = record;
        else delete next[id];
        return next;
      });
    },
    onSelectAll: (selected: boolean, selectedRows: TIssue[]) => {
      const currentIds = displayIssues.map((i) => String(i.id));
      setSelectedIssueIds((prev) => {
        const next = new Set(prev);
        if (selected) currentIds.forEach((id) => next.add(id));
        else currentIds.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedIssuesMap((prev) => {
        const next = { ...prev };
        if (selected) {
          displayIssues.forEach((i) => (next[String(i.id)] = i));
        } else {
          displayIssues.forEach((i) => delete next[String(i.id)]);
        }
        return next;
      });
    },
    // 合并式更新，避免覆盖掉其它项目页的选中
    onChange: (selectedRowKeys: React.Key[], selectedRows: TIssue[]) => {
      const selectedKeySet = new Set((selectedRowKeys || []).map((k) => String(k)));
      const currentIdsSet = new Set(displayIssues.map((i) => String(i.id)));

      setSelectedIssueIds((prev) => {
        const next = new Set(prev);
        // 先移除当前数据集中未选中的
        currentIdsSet.forEach((id) => {
          if (!selectedKeySet.has(id)) next.delete(id);
        });
        // 再加入当前选中的
        selectedKeySet.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIssuesMap((prev) => {
        const next = { ...prev };
        // 移除当前数据集中未选中的
        displayIssues.forEach((i) => {
          const id = String(i.id);
          if (!selectedKeySet.has(id)) delete next[id];
        });
        // 加入当前数据集中选中的记录（保留其它项目页的已选项）
        selectedRows.forEach((r) => {
          next[String(r.id)] = r;
        });
        return next;
      });
    },
  };

  useEffect(() => {
    // 模态打开时，根据父组件传入的 initialSelectedIssues 进行回显初始化
    if (!isOpen) return;
    const arr = initialSelectedIssues || [];
    const ids = arr.map((i) => String(i.id));
    const map = Object.fromEntries(arr.map((i) => [String(i.id), i]));
    setSelectedIssueIds(new Set(ids));
    setSelectedIssuesMap(map);
  }, [isOpen, initialSelectedIssues]);

  const normalizeIssues = (res: TIssuesResponse | any): TIssue[] => {
    const results = res?.results || res?.data;
    if (!results) return [];
    if (Array.isArray(results)) return results as TIssue[];
    const out: TIssue[] = [];
    for (const key in results) {
      const groupObj = (results as any)[key];
      const groupResults = groupObj?.results;
      if (Array.isArray(groupResults)) {
        out.push(...(groupResults as TIssue[]));
      } else if (groupResults && typeof groupResults === "object") {
        for (const subKey in groupResults) {
          const sub = groupResults[subKey];
          if (Array.isArray(sub?.results)) out.push(...(sub.results as TIssue[]));
        }
      }
    }
    return out;
  };

  const toggleIssue = (id: string, checked: boolean) => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleConfirm = () => {
    // 返回跨项目、跨分页的全部已选项
    const selected = Object.values(selectedIssuesMap);
    onConfirm(selected);
  };

  // 受控分页：页大小与当前页
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  // 封装获取工作项（带 per_page 与 page 计算 cursor）
  const fetchIssues = async (page: number, perPage: number) => {
    if (!isOpen || !currentProjectId) return;
    setLoadingIssues(true);
    try {
      let res;
      // 如果有 caseId，使用 unselectIssueList 接口（后端过滤已选）
      if (caseId) {
        const queries: any = {
          page,
          per_page: perPage,
          case_id: caseId,
          project_id: currentProjectId,
        };
        if (forceTypeName) {
          if (forceTypeName === "Requirement") {
            queries.type_name = "史诗,特性,用户故事";
          } else if (forceTypeName === "Task") {
            queries.type_name = "任务";
          } else if (forceTypeName === "Bug") {
            queries.type_name = "缺陷";
          }
        }
        res = await caseService.unselectIssueList(workspaceSlug, queries);
        // 新接口返回结构: { results: TIssue[], count: number } (假设 list_response 格式)
        // 或者 { data: ..., count: ... }，需根据 normalizeIssues 调整
        // 假设 unselectIssueList 返回的是标准分页响应，normalizeIssues 可以处理
        // 但注意：新接口参数名是 type_name，旧接口我们之前改的是 type__name / type__name__in
      } else {
        // 没有 caseId（如创建用例时），回退到通用 issue 列表接口
        const offset = (page - 1) * perPage;
        const queries: any = { per_page: perPage, cursor: `${perPage}:${offset}:0` };
        if (forceTypeName) {
          if (forceTypeName === "Requirement") {
            queries.type__name__in = "史诗,特性,用户故事";
          } else if (forceTypeName === "Task") {
            queries.type__name = "任务";
          } else if (forceTypeName === "Bug") {
            queries.type__name = "缺陷";
          }
        }
        res = await issueService.getIssues(workspaceSlug, currentProjectId, queries);
      }

      const flat = normalizeIssues(res);
      setIssues(flat);
      // 提取总数
      // 新接口可能直接返回 count，旧接口可能在 res.total_count
      const total = (res as any)?.count ?? (res as any)?.total_count ?? flat.length;
      setTotalCount(total);
      // 更新当前页
      setCurrentPage(page);
    } catch (err: any) {
      const errorMessage = err?.error?.includes("required permissions") ? "你没有权限访问该项目" : err?.error;
      message.error(`获取工作项失败：${errorMessage || "未知错误"}`);
    } finally {
      setLoadingIssues(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !currentProjectId) {
      setIssues([]);
      return;
    }
    // 加载项目变更或弹窗开启时按当前 pageSize 拉首屏数据
    fetchIssues(1, pageSize);
  }, [isOpen, workspaceSlug, currentProjectId, issueService, caseService, forceTypeName, caseId]);

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      title="选择工作项"
      width="70vw"
      destroyOnClose
      maskClosable={false}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleConfirm} disabled={selectedIssueIds.size === 0}>
            确定
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", gap: 16, height: "60vh" }}>
        {/* 右侧工作项：Table + 分页 */}
        <div style={{ width: "100%" }}>
          <Table<TIssue>
            size="small"
            rowKey="id"
            loading={loadingIssues}
            dataSource={displayIssues}
            columns={columns as any}
            onChange={handleTableChange}
            pagination={{
              current: currentPage,
              pageSize,
              total: totalCount ?? displayIssues.length,
              showSizeChanger: true,
              showQuickJumper: true,
              onChange: (page) => {
                setCurrentPage(page);
                fetchIssues(page, pageSize);
              },
              onShowSizeChange: (_current, size) => {
                setPageSize(size);
                fetchIssues(1, size);
              },
              showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            }}
            rowSelection={rowSelection as any}
          />
        </div>
      </div>
    </Modal>
  );
};

