/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** 登录页背景：竖向刻度线 + 右上 / 左下两组进度条装饰，纯展示 */
export function AuthBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border-subtle)_1px,transparent_1px)] bg-[length:78px_100%] md:bg-[length:120px_100%]"
    >
      <div className="absolute top-14 -right-10 h-7 w-[196px] rounded-lg bg-accent-subtle-active md:top-24 md:h-9 md:w-[400px]" />
      <div className="absolute top-[100px] right-[78px] h-7 w-[156px] rounded-lg bg-[var(--brand-400)] md:top-[156px] md:right-60 md:h-9 md:w-[360px]" />
      <div className="absolute top-[216px] right-[120px] hidden h-9 w-60 rounded-lg border border-dashed border-[var(--brand-500)] md:block" />
      <div className="absolute bottom-[132px] -left-10 h-7 w-[196px] rounded-lg bg-accent-subtle-active md:bottom-[216px] md:h-9 md:w-[400px]" />
      <div className="absolute bottom-[156px] left-60 hidden h-9 w-60 rounded-lg bg-[var(--brand-400)] md:block" />
      <div className="absolute bottom-[88px] left-[78px] h-7 w-[156px] rounded-lg border border-dashed border-[var(--brand-500)] md:bottom-24 md:left-[120px] md:h-9 md:w-60" />
      <div className="absolute bottom-[95px] left-[305px] size-3.5 rotate-45 rounded-xs bg-[var(--brand-600)] md:bottom-[107px] md:left-[473px]" />
    </div>
  );
}
