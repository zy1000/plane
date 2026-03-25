/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { CloudOff, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useTranslation } from "@plane/i18n";
import { AlertModalCore, Button, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { useProjectPmsInfo } from "@/hooks/store/use-project-pms-info";
import {
  PMS_METER_TYPE_OPTIONS,
  PMS_REPRODUCE_OPTIONS,
  getPmsMeterTypeLabel,
  type TPmsSyncFailedIssue,
  type TProjectPmsInfo,
} from "@/services/project/project-pms-info.service";

type FormState = {
  sub_project: string;
  project_code: string;
  meter_type: string;
  software_version: string;
  tool_version: string;
  reproduce: string;
};

const emptyForm = (): FormState => ({
  sub_project: "",
  project_code: "",
  meter_type: "01-电表",
  software_version: "",
  tool_version: "",
  reproduce: "操作级",
});

const fromRow = (row: TProjectPmsInfo): FormState => ({
  sub_project: row.sub_project,
  project_code: row.project_code,
  meter_type: row.meter_type,
  software_version: row.software_version,
  tool_version: row.tool_version,
  reproduce: row.reproduce,
});

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export function ProjectPmsSyncSettingsRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { items, isLoading, create, update, remove, sync } = useProjectPmsInfo(workspaceSlug, projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFailedIssues, setSyncFailedIssues] = useState<TPmsSyncFailedIssue[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<TProjectPmsInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const tk = useCallback((key: string) => t(`project_settings.pms_sync.${key}` as never), [t]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((row: TProjectPmsInfo) => {
    setEditingId(row.id);
    setForm(fromRow(row));
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingId(null);
    setIsSaving(false);
  }, []);

  const validate = useCallback(() => {
    const checks = [
      form.sub_project.trim(),
      form.project_code.trim(),
      form.software_version.trim(),
      form.tool_version.trim(),
    ];
    return checks.every(Boolean);
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!validate()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: tk("heading"),
        message: tk("validation_required"),
      });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        sub_project: form.sub_project.trim(),
        project_code: form.project_code.trim(),
        meter_type: form.meter_type,
        software_version: form.software_version.trim(),
        tool_version: form.tool_version.trim(),
        reproduce: form.reproduce as TProjectPmsInfo["reproduce"],
      };
      if (editingId == null) {
        await create(payload);
      } else {
        await update(editingId, payload);
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: tk("heading"),
        message: editingId == null ? tk("toast_created") : tk("toast_saved"),
      });
      closeForm();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: tk("heading"),
        message: tk("toast_error"),
      });
      setIsSaving(false);
    }
  }, [closeForm, create, editingId, form, tk, update, validate]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await remove(deleteTarget.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: tk("heading"),
        message: tk("toast_deleted"),
      });
      setDeleteTarget(null);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: tk("heading"),
        message: tk("toast_delete_error"),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, remove, tk]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncFailedIssues([]);
    try {
      const result = await sync();
      const failed = result?.failed_issues ?? [];
      setSyncFailedIssues(failed);
      if (failed.length > 0) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: tk("heading"),
          message: tk("sync_partial_warning"),
        });
      } else {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: tk("heading"),
          message: tk("sync_success"),
        });
      }
    } catch {
      setSyncFailedIssues([]);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: tk("heading"),
        message: tk("sync_error"),
      });
    } finally {
      setIsSyncing(false);
    }
  }, [sync, tk]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => b.id - a.id), [items]);

  return (
    <div className="space-y-6 motion-reduce:transition-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm leading-relaxed text-secondary transition-colors duration-200">
          {tk("table_hint")}
        </p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {!isLoading && sortedItems.length > 0 && (
            <Button
              variant="outline-primary"
              size="sm"
              prependIcon={<RefreshCw className="h-3.5 w-3.5" />}
              loading={isSyncing}
              onClick={() => void handleSync()}
            >
              {tk("sync_action")}
            </Button>
          )}
          {!isLoading && sortedItems.length === 0 && (
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={openCreate}
            >
              {tk("add")}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-raised-100 transition-[box-shadow] duration-200 motion-reduce:transition-none">
        {isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-tertiary">{tk("loading")}</div>
        ) : sortedItems.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-layer-2 text-tertiary ring-1 ring-subtle transition-colors duration-200">
              <CloudOff className="size-7" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <p className="text-body-sm-semibold text-primary">{tk("empty_title")}</p>
              <p className="mt-1 max-w-md text-caption-md-regular text-secondary">{tk("empty_description")}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-caption-md-regular">
              <thead>
                <tr className="border-b border-subtle bg-layer-1">
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-tertiary">{tk("sub_project")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-tertiary">{tk("project_code")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-tertiary">{tk("meter_type")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-tertiary">{tk("software_version")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-tertiary">{tk("tool_version")}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-tertiary">{tk("reproduce")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-tertiary">{tk("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-subtle last:border-0 transition-colors duration-200 hover:bg-layer-1 motion-reduce:transition-none"
                  >
                    <td className="max-w-[160px] truncate px-4 py-3 font-medium text-primary">{row.sub_project}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-secondary tabular-nums">{row.project_code}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-secondary">{getPmsMeterTypeLabel(row.meter_type)}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-secondary">{row.software_version}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-secondary">{row.tool_version}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-secondary">{row.reproduce}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-0.5">
                        <IconButton
                          variant="ghost"
                          size="sm"
                          icon={Pencil}
                          onClick={() => openEdit(row)}
                          aria-label={tk("edit_action")}
                        />
                        <IconButton
                          variant="ghost"
                          size="sm"
                          className="group"
                          icon={Trash2}
                          iconClassName="text-tertiary group-hover:text-danger-primary"
                          onClick={() => setDeleteTarget(row)}
                          aria-label={tk("delete_action")}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {syncFailedIssues.length > 0 && (
        <div className="rounded-xl border border-danger-strong/40 bg-danger-subtle/20 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-body-sm-semibold text-danger-primary">{tk("sync_failed_title")}</h4>
            <Button variant="link-neutral" size="sm" type="button" onClick={() => setSyncFailedIssues([])}>
              {tk("sync_failed_dismiss")}
            </Button>
          </div>
          <ul className="mt-3 space-y-3 border-t border-subtle pt-3">
            {syncFailedIssues.map((f) => (
              <li key={f.id} className="text-caption-md-regular">
                <Link
                  to={`/${workspaceSlug}/projects/${projectId}/issues/${f.id}`}
                  className="font-medium text-accent-primary transition-colors hover:underline"
                >
                  #{f.sequence_id} {f.name}
                </Link>
                <p className="mt-1 break-words text-caption-sm-regular text-secondary">{f.error}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ModalCore
        isOpen={formOpen}
        handleClose={closeForm}
        position={EModalPosition.CENTER}
        width={EModalWidth.XXL}
      >
        <div className="border-b border-subtle px-5 py-4">
          <h3 className="text-base font-semibold text-primary">
            {editingId == null ? tk("create") : tk("edit")}
          </h3>
          <p className="mt-1 text-caption-md-regular text-secondary">
            {tk("description")}
          </p>
        </div>
        <div className="max-h-[min(70vh,560px)] overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-caption-md-medium text-tertiary" htmlFor="pms-sub-project">
                {tk("sub_project")}
              </label>
              <Input
                id="pms-sub-project"
                value={form.sub_project}
                onChange={(e) => setForm((f) => ({ ...f, sub_project: e.target.value }))}
                placeholder={tk("sub_project")}
                className="w-full border-subtle"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption-md-medium text-tertiary" htmlFor="pms-project-code">
                {tk("project_code")}
              </label>
              <Input
                id="pms-project-code"
                value={form.project_code}
                onChange={(e) => setForm((f) => ({ ...f, project_code: e.target.value }))}
                placeholder={tk("project_code")}
                className="w-full border-subtle"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-caption-md-medium text-tertiary">{tk("meter_type")}</span>
              <CustomSelect
                value={form.meter_type}
                onChange={(v) => setForm((f) => ({ ...f, meter_type: String(v) }))}
                label={getPmsMeterTypeLabel(form.meter_type)}
                buttonClassName="border border-subtle bg-layer-2 !shadow-none !rounded-md w-full"
                input
              >
                {PMS_METER_TYPE_OPTIONS.map((opt) => (
                  <CustomSelect.Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-caption-md-medium text-tertiary">{tk("reproduce")}</span>
              <CustomSelect
                value={form.reproduce}
                onChange={(v) => setForm((f) => ({ ...f, reproduce: String(v) }))}
                label={form.reproduce}
                buttonClassName="border border-subtle bg-layer-2 !shadow-none !rounded-md w-full"
                input
              >
                {PMS_REPRODUCE_OPTIONS.map((opt) => (
                  <CustomSelect.Option key={opt} value={opt}>
                    {opt}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-caption-md-medium text-tertiary" htmlFor="pms-software-version">
                {tk("software_version")}
              </label>
              <Input
                id="pms-software-version"
                value={form.software_version}
                onChange={(e) => setForm((f) => ({ ...f, software_version: e.target.value }))}
                placeholder={tk("software_version")}
                className="w-full border-subtle"
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-caption-md-medium text-tertiary" htmlFor="pms-tool-version">
                {tk("tool_version")}
              </label>
              <Input
                id="pms-tool-version"
                value={form.tool_version}
                onChange={(e) => setForm((f) => ({ ...f, tool_version: e.target.value }))}
                placeholder={tk("tool_version")}
                className="w-full border-subtle"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-4">
          <Button variant="neutral-primary" size="sm" type="button" onClick={closeForm} disabled={isSaving}>
            {tk("cancel")}
          </Button>
          <Button variant="primary" size="sm" type="button" onClick={() => void handleSave()} loading={isSaving}>
            {editingId == null ? tk("create") : tk("save")}
          </Button>
        </div>
      </ModalCore>

      <AlertModalCore
        isOpen={!!deleteTarget}
        handleClose={() => setDeleteTarget(null)}
        handleSubmit={() => void handleConfirmDelete()}
        isSubmitting={isDeleting}
        title={tk("delete_confirm_title")}
        content={tk("delete_confirm_description")}
        primaryButtonText={{
          loading: tk("delete_loading"),
          default: tk("delete_action"),
        }}
        secondaryButtonText={tk("cancel")}
      />
    </div>
  );
}
