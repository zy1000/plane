/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import type { ICustomSearchSelectOption, IMyAccessVisibleProject } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { Chip } from "./chips";

type Props = {
  projects: IMyAccessVisibleProject[];
  /** null = 全部可见项目 */
  value: string | null;
  onChange: (projectId: string | null) => void;
};

const ALL = "__all__";

/** 分组标题借用禁用项画：搜索时 query 为空会被过滤掉，键盘导航也会跳过 */
const headerOption = (key: string, label: string): ICustomSearchSelectOption => ({
  value: `__header_${key}`,
  query: "",
  disabled: true,
  content: <span className="text-11 font-medium tracking-wide text-tertiary">{label}</span>,
});

const projectOption = (project: IMyAccessVisibleProject): ICustomSearchSelectOption => ({
  value: project.id,
  query: `${project.name} ${project.identifier}`,
  content: (
    <span className="flex items-center gap-2">
      <span className="truncate text-13 text-primary">{project.name}</span>
      <span className="shrink-0 text-12 text-tertiary">{project.identifier}</span>
      {(project.is_lead || project.is_member) && (
        <Chip tone={project.is_lead ? "orange" : "green"} className="ml-auto">
          {project.is_lead ? "负责人" : "成员"}
        </Chip>
      )}
    </span>
  ),
});

/** 「项目权限」右侧的项目选择器：全部可见项目 / 我参与的 / 仅数据权限可见 */
export function MyAccessProjectPicker({ projects, value, onChange }: Props) {
  const selected = value ? projects.find((project) => project.id === value) : undefined;

  const options = useMemo<ICustomSearchSelectOption[]>(() => {
    const participating = projects.filter((project) => project.is_member || project.is_lead);
    const dataOnly = projects.filter((project) => !project.is_member && !project.is_lead);
    return [
      {
        value: ALL,
        query: "全部可见项目",
        content: (
          <span className="flex items-center justify-between gap-2">
            <span className="text-13 text-primary">全部可见项目</span>
            <span className="text-12 text-tertiary tabular-nums">{projects.length}</span>
          </span>
        ),
      },
      ...(participating.length > 0 ? [headerOption("participating", "我参与的"), ...participating.map(projectOption)] : []),
      ...(dataOnly.length > 0 ? [headerOption("data-only", "仅数据权限可见"), ...dataOnly.map(projectOption)] : []),
    ];
  }, [projects]);

  return (
    <CustomSearchSelect
      value={value ?? ALL}
      onChange={(next: string) => onChange(next === ALL ? null : next)}
      options={options}
      customButton={
        <span className="flex h-9 items-center gap-1.5 rounded-lg border border-subtle bg-surface-1 px-3 text-14 text-primary transition-colors hover:bg-layer-1-hover">
          {selected ? (
            <>
              <span className="text-tertiary">项目</span>
              <span className="max-w-60 truncate font-medium" title={selected.name}>
                {selected.name}
              </span>
            </>
          ) : (
            "全部可见项目"
          )}
          <ChevronDown className="size-4 shrink-0 text-tertiary" />
        </span>
      }
      customButtonClassName="rounded-lg"
      optionsClassName="w-80"
      maxHeight="lg"
      placement="bottom-end"
      searchPlaceholder="搜索项目名或代号"
      noResultsMessage="没有匹配的项目"
    />
  );
}
