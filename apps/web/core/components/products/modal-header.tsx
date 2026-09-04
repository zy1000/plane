/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TLogoProps, TProductNetwork } from "@plane/types";
import { cn } from "@plane/utils";
import { FORM_VARIANT_STYLES } from "@/components/common/form-section";
import { IDENTIFIER_MAX_LENGTH, sanitizeIdentifier } from "@/components/common/identifier-input";
import { ProductLogoHeader } from "./logo-header";
import { ProductNetworkSegmented } from "./network-segmented";

type Props = {
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
  onClose: () => void;
  isMobile?: boolean;
  /** 弹窗打开时聚焦的名称输入框（ModalCore 的 initialFocus） */
  nameInputRef?: MutableRefObject<HTMLInputElement | null>;
  autoFocusName?: boolean;
};

/**
 * 产品弹窗顶部的「身份区」：logo 大块 + 大字产品名 + 开发编号芯片 + 可见性开关 + 关闭按钮。
 * 与创建项目弹窗（project/create/header.tsx）同一套结构；开发编号不随名称自动生成，由用户手填。
 */
export function ProductModalHeader(props: Props) {
  const {
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
    onClose,
    isMobile = false,
    nameInputRef,
    autoFocusName = false,
  } = props;
  const { t } = useTranslation();
  const styles = FORM_VARIANT_STYLES["grouped-modal"];

  return (
    <div className="grid shrink-0 grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-x-4 px-8 pt-7 pb-5">
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
            placeholder={t("workspace_products.create.name_placeholder")}
            className={cn(
              "block w-full border-0 border-b-2 border-transparent bg-transparent px-0 py-1 text-[22px] leading-tight font-semibold tracking-tight text-primary outline-none placeholder:font-medium placeholder:text-placeholder focus:border-accent-strong",
              Boolean(nameError) && "border-danger-strong"
            )}
          />
        ) : (
          <p className="py-1 text-[22px] leading-tight font-semibold tracking-tight text-primary">{name || "—"}</p>
        )}
        {nameError ? <p className={styles.error}>{nameError}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Tooltip
            isMobile={isMobile}
            tooltipContent={t("workspace_products.fields.identifier_hint")}
            className="text-13"
            position="bottom-start"
          >
            <label
              className={cn(
                "inline-flex h-7 items-center overflow-hidden rounded-md border border-subtle-1 bg-layer-1",
                editable && "focus-within:border-accent-strong",
                Boolean(identifierError) && "border-danger-strong"
              )}
            >
              <span className="flex h-full items-center border-r border-subtle-1 px-2 text-11 font-semibold text-tertiary">
                {t("workspace_products.fields.identifier")}
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
        {identifierError ? <p className={styles.error}>{identifierError}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        aria-label={t("close")}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
