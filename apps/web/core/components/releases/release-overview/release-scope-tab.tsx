/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Download, FileText, Plus, Repeat, Trash2, Unlink, Upload } from "lucide-react";
import { Popconfirm } from "antd";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { ReadonlyDate } from "@/components/readonly/date";
import { formatFileSize, formatReleaseOverviewDateRange } from "./release-format";
import { CycleStatusTag, PlanPassRate, PlanStateTag } from "./release-tags";

type Cycle = {
  id: string;
  name: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type Plan = {
  id: string;
  name?: string | null;
  state?: string | null;
  begin_time?: string | null;
  end_time?: string | null;
  pass_rate?: Record<string, number> | null;
};

type FileItem = {
  id: string;
  name: string;
  size: number;
  created_at: string;
};

const SECTION_CARD = "flex min-h-[380px] flex-col rounded-xl border border-subtle bg-surface-1";
const SECTION_BODY = "flex min-h-0 flex-1 flex-col border-t border-subtle px-5 py-3";
const TABLE_HEAD_CLASS =
  "text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]";

const TableEmpty: React.FC<{ hint: string }> = ({ hint }) => (
  <div className="grid min-h-40 flex-1 place-items-center text-sm text-placeholder">{hint}</div>
);

const TableLoading: React.FC = () => (
  <div className="flex min-h-40 flex-1 items-center justify-center py-8 text-sm text-secondary">加载中...</div>
);

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
  actionIcon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  actionDisabled?: boolean;
}> = ({ icon, title, count, actionIcon, actionLabel, onAction, actionLoading, actionDisabled }) => (
  <div className="flex items-center justify-between px-5 py-4">
    <div className="flex min-w-0 items-center gap-2">
      {icon}
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      <span className="rounded-full bg-layer-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-placeholder">
        {count}
      </span>
    </div>
    {actionLabel && onAction && (
      <Button
        variant="secondary"
        size="sm"
        onClick={onAction}
        loading={actionLoading}
        disabled={actionDisabled}
      >
        {actionIcon}
        <span className="ml-1">{actionLabel}</span>
      </Button>
    )}
  </div>
);

type CyclesSectionProps = {
  workspaceSlug: string;
  projectId: string;
  cycles: Cycle[];
  cyclesLoading: boolean;
  cyclesError: string | null;
  onOpenCycleAssociate: () => void;
  onCancelCycleAssociation: (cycleId: string) => Promise<void> | void;
  className?: string;
};

export const ReleaseCyclesSection: React.FC<CyclesSectionProps> = ({
  workspaceSlug,
  projectId,
  cycles,
  cyclesLoading,
  cyclesError,
  onOpenCycleAssociate,
  onCancelCycleAssociation,
  className,
}) => {
  const router = useRouter();
  return (
    <section className={cn(SECTION_CARD, className)}>
      <SectionHeader
        icon={<Repeat className="h-4 w-4 text-[#1677ff]" aria-hidden />}
        title="关联迭代"
        count={cycles.length}
        actionIcon={<Plus className="h-3.5 w-3.5" aria-hidden />}
        actionLabel="关联迭代"
        onAction={onOpenCycleAssociate}
      />
      <div className={SECTION_BODY}>
        {cyclesLoading ? (
          <TableLoading />
        ) : cyclesError ? (
          <p className="text-sm text-danger-primary">{cyclesError}</p>
        ) : cycles.length === 0 ? (
          <TableEmpty hint="暂无关联迭代" />
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="min-w-full table-fixed">
              <thead>
                <tr className={TABLE_HEAD_CLASS}>
                  <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">迭代</th>
                  <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">状态</th>
                  <th className="w-1/4 px-2 py-2 text-sm font-medium tabular-nums text-primary">日期</th>
                  <th className="w-[120px] pl-10 pr-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id} className="border-b border-subtle last:border-b-0 hover:bg-layer-1">
                    <td className="truncate px-2 py-2 text-sm text-primary" title={c.name}>
                      {c.id ? (
                        <button
                          type="button"
                          className="cursor-pointer truncate text-left text-sm text-primary hover:underline"
                          onClick={() =>
                            router.push(`/${workspaceSlug}/projects/${projectId}/cycles/${c.id}/overview`)
                          }
                        >
                          {c.name}
                        </button>
                      ) : (
                        c.name
                      )}
                    </td>
                    <td className="px-2 py-2 text-sm text-primary">
                      <CycleStatusTag cycle={c} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm tabular-nums text-primary">
                      {formatReleaseOverviewDateRange(c.start_date, c.end_date)}
                    </td>
                    <td className="pl-10 pr-2 py-2 text-left">
                      <Popconfirm
                        title="确定取消该迭代的关联吗？"
                        okText="取消关联"
                        cancelText="取消"
                        onConfirm={() => void onCancelCycleAssociation(c.id)}
                      >
                        <Button variant="link-neutral" className="p-0" aria-label="取消关联">
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </Popconfirm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

type PlansSectionProps = {
  workspaceSlug: string;
  projectId: string;
  plans: Plan[];
  plansLoading: boolean;
  plansError: string | null;
  cancelingPlanId: string | null;
  onOpenPlanAssociate: () => void;
  onCancelPlanAssociation: (planId: string) => Promise<void> | void;
  className?: string;
};

export const ReleasePlansSection: React.FC<PlansSectionProps> = ({
  workspaceSlug,
  projectId,
  plans,
  plansLoading,
  plansError,
  cancelingPlanId,
  onOpenPlanAssociate,
  onCancelPlanAssociation,
  className,
}) => {
  const router = useRouter();
  return (
    <section className={cn(SECTION_CARD, className)}>
      <SectionHeader
        icon={<ClipboardList className="h-4 w-4 text-[#6366f1]" aria-hidden />}
        title="测试计划"
        count={plans.length}
        actionIcon={<Plus className="h-3.5 w-3.5" aria-hidden />}
        actionLabel="关联测试计划"
        onAction={onOpenPlanAssociate}
      />
      <div className={SECTION_BODY}>
        {plansLoading ? (
          <TableLoading />
        ) : plansError ? (
          <p className="text-sm text-danger-primary">{plansError}</p>
        ) : plans.length === 0 ? (
          <TableEmpty hint="暂无关联测试计划" />
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="min-w-full table-fixed">
              <thead>
                <tr className={TABLE_HEAD_CLASS}>
                  <th className="w-1/3 px-2 py-2 text-sm font-medium text-primary">测试计划</th>
                  <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">状态</th>
                  <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">通过率</th>
                  <th className="w-1/4 px-2 py-2 text-sm font-medium tabular-nums text-primary">日期</th>
                  <th className="w-[120px] pl-10 pr-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-subtle last:border-b-0 hover:bg-layer-1">
                    <td className="truncate px-2 py-2 text-sm text-primary" title={p.name ?? "-"}>
                      {p.id ? (
                        <button
                          type="button"
                          className="cursor-pointer truncate text-left text-sm text-primary hover:underline"
                          onClick={() =>
                            router.push(
                              `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${p.id}`
                            )
                          }
                        >
                          {p.name ?? "-"}
                        </button>
                      ) : (
                        p.name ?? "-"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <PlanStateTag state={p.state} />
                    </td>
                    <td className="px-2 py-2">
                      <PlanPassRate passRate={p.pass_rate} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm tabular-nums text-primary">
                      {formatReleaseOverviewDateRange(p.begin_time, p.end_time)}
                    </td>
                    <td className="pl-10 pr-2 py-2 text-left" onClick={(e) => e.stopPropagation()}>
                      <Popconfirm
                        title="确定取消该测试计划的关联吗？"
                        okText="取消关联"
                        cancelText="取消"
                        onConfirm={() => void onCancelPlanAssociation(p.id)}
                      >
                        <Button
                          variant="link-neutral"
                          className="p-0"
                          loading={cancelingPlanId === p.id}
                          disabled={cancelingPlanId === p.id}
                          aria-label="取消关联"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </Popconfirm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

type FilesSectionProps = {
  files: FileItem[];
  filesLoading: boolean;
  filesError: string | null;
  filesUploading: boolean;
  filesDeletingId: string | null;
  filesDownloadingId: string | null;
  onTriggerUploadFile: () => void;
  onDeleteFile: (fileId: string) => Promise<void> | void;
  onDownloadFile: (fileId: string, fileName: string) => Promise<void> | void;
  className?: string;
};

export const ReleaseFilesSection: React.FC<FilesSectionProps> = ({
  files,
  filesLoading,
  filesError,
  filesUploading,
  filesDeletingId,
  filesDownloadingId,
  onTriggerUploadFile,
  onDeleteFile,
  onDownloadFile,
  className,
}) => (
  <section className={cn(SECTION_CARD, className)}>
    <SectionHeader
      icon={<FileText className="h-4 w-4 text-placeholder" aria-hidden />}
      title="附件"
      count={files.length}
      actionIcon={<Upload className="h-3.5 w-3.5" aria-hidden />}
      actionLabel="上传附件"
      onAction={onTriggerUploadFile}
      actionLoading={filesUploading}
      actionDisabled={filesUploading}
    />
    <div className={SECTION_BODY}>
      {filesLoading ? (
        <TableLoading />
      ) : filesError ? (
        <p className="text-sm text-danger-primary">{filesError}</p>
      ) : files.length === 0 ? (
        <TableEmpty hint="暂无附件" />
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className={TABLE_HEAD_CLASS}>
                <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">附件</th>
                <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">大小</th>
                <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">上传时间</th>
                <th className="w-[140px] pl-10 pr-2 py-2 text-left text-sm font-medium text-primary">操作</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} className="border-b border-subtle last:border-b-0 hover:bg-layer-1">
                  <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                    <span className="truncate">{file.name}</span>
                  </td>
                  <td className="px-2 py-2 text-sm text-primary">{formatFileSize(Number(file.size ?? 0))}</td>
                  <td className="px-2 py-2 text-sm text-primary">
                    <ReadonlyDate value={file.created_at} formatToken="yyyy-MM-dd" hideIcon={true} />
                  </td>
                  <td className="pl-10 pr-2 py-2">
                    <div className="flex items-center justify-start gap-2">
                      <Button
                        variant="link-neutral"
                        className="p-0"
                        disabled={filesDownloadingId === file.id}
                        onClick={() => onDownloadFile(file.id, file.name)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Popconfirm
                        title="确认删除该附件？"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => void onDeleteFile(file.id)}
                      >
                        <Button
                          variant="link-danger"
                          className="p-0"
                          disabled={filesDeletingId === file.id}
                          loading={filesDeletingId === file.id}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-danger-primary" />
                        </Button>
                      </Popconfirm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </section>
);

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycles: Cycle[];
  cyclesLoading: boolean;
  cyclesError: string | null;
  plans: Plan[];
  plansLoading: boolean;
  plansError: string | null;
  cancelingPlanId: string | null;
  files: FileItem[];
  filesLoading: boolean;
  filesError: string | null;
  filesUploading: boolean;
  filesDeletingId: string | null;
  filesDownloadingId: string | null;
  onOpenCycleAssociate: () => void;
  onCancelCycleAssociation: (cycleId: string) => Promise<void> | void;
  onOpenPlanAssociate: () => void;
  onCancelPlanAssociation: (planId: string) => Promise<void> | void;
  onTriggerUploadFile: () => void;
  onDeleteFile: (fileId: string) => Promise<void> | void;
  onDownloadFile: (fileId: string, fileName: string) => Promise<void> | void;
};

export const ReleaseScopeTab: React.FC<Props> = ({
  workspaceSlug,
  projectId,
  cycles,
  cyclesLoading,
  cyclesError,
  plans,
  plansLoading,
  plansError,
  cancelingPlanId,
  files,
  filesLoading,
  filesError,
  filesUploading,
  filesDeletingId,
  filesDownloadingId,
  onOpenCycleAssociate,
  onCancelCycleAssociation,
  onOpenPlanAssociate,
  onCancelPlanAssociation,
  onTriggerUploadFile,
  onDeleteFile,
  onDownloadFile,
}) => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
    <ReleaseCyclesSection
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      cycles={cycles}
      cyclesLoading={cyclesLoading}
      cyclesError={cyclesError}
      onOpenCycleAssociate={onOpenCycleAssociate}
      onCancelCycleAssociation={onCancelCycleAssociation}
    />
    <ReleasePlansSection
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      plans={plans}
      plansLoading={plansLoading}
      plansError={plansError}
      cancelingPlanId={cancelingPlanId}
      onOpenPlanAssociate={onOpenPlanAssociate}
      onCancelPlanAssociation={onCancelPlanAssociation}
    />
    <ReleaseFilesSection
      className="xl:col-span-2 2xl:col-span-1"
      files={files}
      filesLoading={filesLoading}
      filesError={filesError}
      filesUploading={filesUploading}
      filesDeletingId={filesDeletingId}
      filesDownloadingId={filesDownloadingId}
      onTriggerUploadFile={onTriggerUploadFile}
      onDeleteFile={onDeleteFile}
      onDownloadFile={onDownloadFile}
    />
  </div>
);
