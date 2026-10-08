/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TLogoProps, TProductNetwork } from "@plane/types";
import { cn } from "@plane/utils";
import { ModalInlineError } from "@/components/common/form-modal";
import { IDENTIFIER_MAX_LENGTH, sanitizeIdentifier } from "@/components/common/identifier-input";
import { ProductLogoHeader } from "./logo-header";
import { ProductNetworkSegmented } from "./network-segmented";

type Props = {
  /** 左上角的小标题：创建产品 / 编辑产品 / 产品详情 */
  title: string;
  editable: boolean;
  name: string;
  onNameChange: (value: string) => void;
  nameError: string | null;
  identifier: string;
  onIdentifierChange: (value: string) => void;
  identifierError: string | null;
  network: TProductNetwork;
  onNetworkChange: (value: TProductNetwork) => void;
  logoProps: TLogoProps | undefined;
  onLogoChange: (value: TLogoProps) => void;
  isMobile?: boolean;
  /** 弹窗打开时聚焦的名称输入框（ModalCore 的 initialFocus） */
  nameInputRef?: MutableRefObject<HTMLInputElement | null>;
  autoFocusName?: boolean;
};

/**
 * 产品弹窗左栏顶部的身份区：logo 大块 + 大字产品名 + 开发编号芯片 + 可见性开关。
 * 开发编号不随名称自动生成，由用户手填。
 */
export function ProductModalIdentity(props: Props) {
  const {
    title,
    editable,
    name,
    onNameChange,
    nameError,
    identifier,
    onIdentifierChange,
    identifierError,
    network,
    onNetworkChange,
    logoProps,
    onLogoChange,
    isMobile = false,
    nameInputRef,
    autoFocusName = false,
  } = props;
  const { t } = useTranslation();

  return (
    <div>
      <p className="mb-4.5 text-13 font-medium text-tertiary">{title}</p>
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-4.5">
        <ProductLogoHeader
          logoProps={logoProps}
          editable={editable}
          onLogoChange={onLogoChange}
          tileClassName="h-16 w-16 rounded-2xl border-0 bg-accent-subtle"
          logoSize={32}
        />
        <div className="min-w-0">
          {editable ? (
            <input
              id="product-name"
              name="name"
              type="text"
              autoComplete="off"
              ref={(element) => {
                if (nameInputRef) nameInputRef.current = element;
              }}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={255}
              autoFocus={autoFocusName}
              aria-label={t("workspace_products.fields.name")}
              placeholder={t("workspace_products.create.name_placeholder")}
              className={cn(
                "block w-full border-0 border-b-2 border-transparent bg-transparent px-0 py-0.5 text-24 leading-tight font-semibold tracking-tight text-primary outline-none placeholder:font-medium placeholder:text-placeholder focus:border-accent-strong",
                Boolean(nameError) && "border-danger-strong"
              )}
            />
          ) : (
            <p className="truncate py-0.5 text-24 leading-tight font-semibold tracking-tight text-primary">
              {name || "—"}
            </p>
          )}
          {nameError ? <ModalInlineError message={nameError} /> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Tooltip
              isMobile={isMobile}
              tooltipContent={t("workspace_products.fields.identifier_hint")}
              className="text-13"
              position="bottom-start"
            >
              <label
                className={cn(
                  "inline-flex h-8 items-center overflow-hidden rounded-lg border border-subtle-1 bg-surface-1",
                  editable && "focus-within:border-accent-strong",
                  Boolean(identifierError) && "border-danger-subtle bg-danger-subtle"
                )}
              >
                <span
                  className={cn(
                    "flex h-full items-center border-r border-subtle-1 bg-layer-1 px-2.5 text-12 font-semibold text-tertiary",
                    Boolean(identifierError) && "border-danger-subtle bg-danger-subtle text-danger-primary"
                  )}
                >
                  {t("workspace_products.fields.identifier")}
                  {editable ? <span className="ml-0.5 text-danger-primary">*</span> : null}
                </span>
                {editable ? (
                  <input
                    id="product-identifier"
                    name="identifier"
                    type="text"
                    autoComplete="off"
                    value={identifier}
                    onChange={(event) => onIdentifierChange(sanitizeIdentifier(event.target.value))}
                    maxLength={IDENTIFIER_MAX_LENGTH}
                    placeholder={t("workspace_products.create.identifier_placeholder")}
                    className={cn(
                      "h-full w-32 bg-transparent px-2.5 font-mono text-13 font-semibold tracking-wide text-primary outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-placeholder",
                      identifier && "uppercase"
                    )}
                  />
                ) : (
                  <span className="px-2.5 font-mono text-13 font-semibold tracking-wide text-primary">
                    {identifier || "—"}
                  </span>
                )}
              </label>
            </Tooltip>
            {editable ? (
              <ProductNetworkSegmented
                value={network}
                onChange={onNetworkChange}
                className="ml-auto"
                isMobile={isMobile}
              />
            ) : null}
          </div>
          {identifierError ? <ModalInlineError message={identifierError} /> : null}
        </div>
      </div>
    </div>
  );
}
