/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import type { IMyAccessVisibleProduct, IMyAccessVisibleProject, IWorkspaceMyAccess } from "@plane/types";
import { Chip, VisibleSourceChip } from "./chips";
import { PRODUCT_SOURCE_ORDER, PROJECT_SOURCE_ORDER, formatBySource } from "./helpers";
import { VisibilityModal } from "./visibility-modal";

const PREVIEW_PROJECTS = 5;
const PREVIEW_PRODUCTS = 8;

function VisibilityCard(props: {
  total: number;
  unit: string;
  summary: string;
  onViewAll: () => void;
  children: ReactNode;
}) {
  const { total, unit, summary, onViewAll, children } = props;
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-subtle bg-surface-1 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-28 leading-none font-semibold text-primary tabular-nums">{total}</span>
          <span className="text-14 text-secondary">{unit}</span>
          {summary && <span className="text-13 text-tertiary">{summary}</span>}
        </div>
        {total > 0 && (
          <button type="button" className="shrink-0 text-13 text-accent-primary hover:underline" onClick={onViewAll}>
            查看全部
          </button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ProjectPreview({ items }: { items: IMyAccessVisibleProject[] }) {
  if (items.length === 0) return <p className="text-13 text-placeholder">没有可见项目</p>;
  return (
    <table className="w-full table-fixed text-13">
      <thead>
        <tr className="text-left text-12 text-tertiary">
          <th className="pb-2 pr-3 font-medium">项目</th>
          <th className="w-28 pb-2 pr-3 font-medium">代号</th>
          <th className="w-[38%] pb-2 font-medium">来源</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-subtle">
        {items.map((project) => (
          <tr key={project.id}>
            <td className="truncate py-2 pr-3 text-primary" title={project.name}>
              {project.name}
            </td>
            <td className="truncate py-2 pr-3 text-secondary">{project.identifier}</td>
            <td className="py-2">
              <div className="flex flex-wrap gap-1">
                {project.sources.map((source, index) => (
                  <VisibleSourceChip key={`${source.type}-${source.group?.id ?? index}`} source={source} />
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductPreview({ items }: { items: IMyAccessVisibleProduct[] }) {
  if (items.length === 0) return <p className="text-13 text-placeholder">没有可见产品</p>;
  const shown = items.slice(0, PREVIEW_PRODUCTS);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((product) => (
        <Chip key={product.id} title={product.name}>
          {product.name}
        </Chip>
      ))}
      {items.length > shown.length && <span className="text-13 text-tertiary">等 {items.length} 个</span>}
    </div>
  );
}

/** 「我能看到什么」：项目卡（3）+ 产品卡（2），各自「查看全部」开弹窗 */
export function VisibilitySection({ visibility }: { visibility: IWorkspaceMyAccess["visibility"] }) {
  const [modal, setModal] = useState<"projects" | "products" | null>(null);
  const { projects, products } = visibility;

  return (
    <section>
      <h2 className="text-[17px] font-semibold text-primary">我能看到什么</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <VisibilityCard
          total={projects.total}
          unit="个项目"
          summary={formatBySource(projects.by_source, PROJECT_SOURCE_ORDER, "全部项目")}
          onViewAll={() => setModal("projects")}
        >
          <ProjectPreview items={projects.items.slice(0, PREVIEW_PROJECTS)} />
        </VisibilityCard>
        <VisibilityCard
          total={products.total}
          unit="个产品"
          summary={formatBySource(products.by_source, PRODUCT_SOURCE_ORDER, "全部产品")}
          onViewAll={() => setModal("products")}
        >
          <ProductPreview items={products.items} />
        </VisibilityCard>
      </div>
      <VisibilityModal
        isOpen={modal === "projects"}
        onClose={() => setModal(null)}
        title="全部可见项目"
        nameLabel="项目"
        items={projects.items}
      />
      <VisibilityModal
        isOpen={modal === "products"}
        onClose={() => setModal(null)}
        title="全部可见产品"
        nameLabel="产品"
        items={products.items}
      />
    </section>
  );
}
