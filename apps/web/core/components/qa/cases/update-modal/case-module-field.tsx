"use client";
import React from "react";
import { TreeSelect } from "antd";
import { CaseService } from "@/services/qa/case.service";

type TModuleNode = { id: string; name?: string; children?: TModuleNode[] };
type TModuleOption = { title: string; value: string; children: TModuleOption[] };
export type TCaseModuleValue = { id: string; name: string } | null;

const caseService = new CaseService();

const toOptions = (nodes: TModuleNode[] | undefined): TModuleOption[] =>
  (nodes ?? []).map((node) => ({
    title: String(node?.name ?? "-"),
    value: String(node.id),
    children: toOptions(node?.children),
  }));

type Props = {
  workspaceSlug?: string;
  /** 用例所在用例库，只能在这个库的模块里挑 */
  repositoryId?: string;
  /** 当前模块，null = 未归类 */
  value: TCaseModuleValue;
  disabled?: boolean;
  onChange: (next: TCaseModuleValue) => void | Promise<void>;
};

/** 用例详情右栏的「模块」：当前用例库的模块树下拉，清空即回到未归类 */
export function CaseModuleField({ workspaceSlug, repositoryId, value, disabled, onChange }: Props) {
  const [options, setOptions] = React.useState<TModuleOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!workspaceSlug || !repositoryId) return;
    let cancelled = false;
    setLoading(true);
    caseService
      .getModules(workspaceSlug, repositoryId)
      .then((data) => !cancelled && setOptions(toOptions(data)))
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, repositoryId]);

  return (
    <TreeSelect
      className="w-full [&_.ant-select-selector]:!px-0"
      variant="borderless"
      suffixIcon={null}
      labelInValue
      // 模块名来自用例详情，树还没拉回来时也能正常显示
      value={value ? { value: value.id, label: value.name } : undefined}
      treeData={options}
      treeDefaultExpandAll
      showSearch
      treeNodeFilterProp="title"
      allowClear
      loading={loading}
      disabled={disabled}
      placeholder="未归类"
      aria-label="模块"
      popupMatchSelectWidth={false}
      dropdownStyle={{ zIndex: 1200, minWidth: 240, maxHeight: 400, overflow: "auto" }}
      notFoundContent="当前用例库暂无模块"
      onChange={(next?: { value: string; label: React.ReactNode }) => {
        if ((next?.value ?? null) === (value?.id ?? null)) return;
        void onChange(next ? { id: String(next.value), name: String(next.label ?? "") } : null);
      }}
    />
  );
}
