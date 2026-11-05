/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { IPermissionGroup, TPermissionGroupKind } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { PERMISSION_GROUP_KINDS, PERMISSION_GROUP_KIND_LABELS, getPermissionGroupErrorMessage } from "./helpers";
import { PermissionGroupSegmented } from "./ui";

export type TPermissionGroupFormValue = {
  name: string;
  description: string;
  /** 创建后不可改；编辑时原样带回 */
  kind: TPermissionGroupKind;
  copy_from: string | null;
};

type Props = {
  isOpen: boolean;
  /** null = 新建 */
  group: IPermissionGroup | null;
  /** 新建时「类型」的初始值（= 列表当前分段） */
  defaultKind?: TPermissionGroupKind;
  /** 新建时「复制自」的候选（这里只会列出同类型的） */
  copyCandidates: IPermissionGroup[];
  onClose: () => void;
  onSubmit: (value: TPermissionGroupFormValue) => Promise<unknown>;
};

const INPUT =
  "h-10 w-full rounded-lg border border-subtle-1 bg-layer-2 px-3 text-14 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong";

/**
 * 新建 / 编辑权限组：新建时先选「类型」（工作区权限组 / 项目权限模板 / 数据权限），再填名称、描述，
 * 可以选同类型的另一个组「复制自」（工作区组 / 模板复制权限内容，数据权限复制可见范围）；编辑时只改名称、描述。
 */
export function PermissionGroupFormModal(props: Props) {
  const { isOpen, group, defaultKind = "workspace", copyCandidates, onClose, onSubmit } = props;
  const [value, setValue] = useState<TPermissionGroupFormValue>({
    name: "",
    description: "",
    kind: group?.kind ?? defaultKind,
    copy_from: null,
  });
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = Boolean(group);

  useEffect(() => {
    if (!isOpen) return;
    setValue({
      name: group?.name ?? "",
      description: group?.description ?? "",
      kind: group?.kind ?? defaultKind,
      copy_from: null,
    });
    setNameError(null);
    setError(null);
  }, [isOpen, group, defaultKind]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = value.name.trim();
    if (!name) return setNameError("请填写名称");
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        description: value.description.trim(),
        kind: value.kind,
        copy_from: value.copy_from,
      });
    } catch (submitError) {
      // 名称字段的报错（如重名）跟在名称框下面，其余放底部
      const nameFieldError =
        submitError && typeof submitError === "object" && !(submitError instanceof Error)
          ? (submitError as { name?: string[] | string }).name
          : undefined;
      if (nameFieldError) setNameError(Array.isArray(nameFieldError) ? nameFieldError[0] : nameFieldError);
      else setError(getPermissionGroupErrorMessage(submitError, "保存失败，请重试"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const kindLabel = PERMISSION_GROUP_KIND_LABELS[value.kind];
  const sameKindCandidates = copyCandidates.filter((candidate) => candidate.kind === value.kind);
  const copySource = sameKindCandidates.find((candidate) => candidate.id === value.copy_from);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-18 font-semibold text-primary">{isEdit ? `编辑${kindLabel}` : `新建${kindLabel}`}</h2>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover disabled:opacity-50"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>
      <form className="flex flex-col gap-5 px-5 py-5" onSubmit={handleSubmit}>
        {!isEdit && (
          <div className="flex flex-col gap-1.5">
            <span className="text-14 font-medium text-primary">类型</span>
            <PermissionGroupSegmented<TPermissionGroupKind>
              items={PERMISSION_GROUP_KINDS.map((kind) => ({ key: kind, label: PERMISSION_GROUP_KIND_LABELS[kind] }))}
              value={value.kind}
              // 换类型后「复制自」的候选也换了，清掉已选
              onChange={(kind) => setValue((current) => ({ ...current, kind, copy_from: null }))}
              size="lg"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 text-14 font-medium text-primary" htmlFor="permission-group-name">
            名称
            <span className="text-danger-primary">*</span>
          </label>
          <input
            id="permission-group-name"
            className={cn(INPUT, nameError && "border-danger-strong focus:border-danger-strong")}
            maxLength={255}
            value={value.name}
            placeholder="请输入名称"
            onChange={(event) => {
              setValue((current) => ({ ...current, name: event.target.value }));
              if (nameError) setNameError(null);
            }}
          />
          {nameError && <p className="text-11 leading-4 text-danger-primary">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-14 font-medium text-primary" htmlFor="permission-group-description">
            描述
          </label>
          <textarea
            id="permission-group-description"
            className="min-h-22 w-full resize-none rounded-lg border border-subtle-1 bg-layer-2 px-3 py-2.5 text-14 leading-5 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong"
            maxLength={500}
            rows={3}
            placeholder="请输入描述"
            value={value.description}
            onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))}
          />
        </div>

        {!isEdit && (
          <div className="flex flex-col gap-1.5">
            <span className="text-14 font-medium text-primary">{value.kind === "data" ? "复制范围自" : "复制权限自"}</span>
            <CustomSelect
              value={value.copy_from}
              onChange={(copyFrom: string | null) => setValue((current) => ({ ...current, copy_from: copyFrom }))}
              label={
                <span className={copySource ? "text-primary" : "text-placeholder"}>
                  {copySource ? copySource.name : "不复制"}
                </span>
              }
              buttonClassName="h-10 w-full rounded-lg border border-subtle-1 bg-layer-2 px-3 text-14"
              // 浮层 portal 到 body，w-full 会撑满整屏；按字段宽度（弹窗 576 - 两侧 20）给定宽
              optionsClassName="w-[536px] max-w-[calc(100vw-4.5rem)] text-13"
              maxHeight="md"
              input
            >
              <CustomSelect.Option value={null}>不复制</CustomSelect.Option>
              {sameKindCandidates.map((candidate) => (
                <CustomSelect.Option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
        )}

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {isEdit ? "保存" : "创建"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
