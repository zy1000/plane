/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@plane/utils";

/** 弹窗左栏（内容区）的输入框 / 下拉按钮：42px 高、10px 圆角 */
export const MODAL_FIELD_CLASS = "h-10.5 w-full rounded-[10px] border px-3.5 text-14";

type TModalFieldLabelProps = {
  htmlFor?: string;
  required?: boolean;
  /** 字段名后面的附注（如「创建后不可更改」） */
  note?: ReactNode;
  children: ReactNode;
};

export const ModalFieldLabel = ({ htmlFor, required, note, children }: TModalFieldLabelProps) => (
  <label htmlFor={htmlFor} className="mb-2 flex items-center text-13 font-medium text-secondary">
    {children}
    {required && <span className="ml-0.5 text-danger-primary">*</span>}
    {note ? <span className="ml-1.5 inline-flex items-center gap-1 text-11 font-normal text-placeholder">{note}</span> : null}
  </label>
);

/** 输入框下方一行红字 */
export const ModalFieldError = ({ message, className }: { message?: string; className?: string }) =>
  message ? <p className={cn("mt-1.5 text-12 text-danger-primary", className)}>{message}</p> : null;

/** 身份区（名称 / 编号）下方带图标的红字 */
export const ModalInlineError = ({ message }: { message: string }) => (
  <p className="mt-1.5 flex items-center gap-1 text-12 text-danger-primary">
    <AlertCircle className="size-3.5 shrink-0" />
    {message}
  </p>
);
