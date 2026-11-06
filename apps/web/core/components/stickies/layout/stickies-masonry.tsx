/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Masonry from "react-masonry-component";

type Props = {
  children: React.ReactNode;
};

export type TStickiesMasonryHandle = {
  performLayout: () => void;
};

/**
 * react-masonry-component 的 StrictMode 补丁。
 *
 * React 18 开发态 StrictMode 会模拟一次「卸载 → 重新挂载」：卸载时 react-masonry-component 把
 * Masonry 实例 destroy 掉（便签项失去绝对定位，退化成普通块级元素一行一个），重新挂载时又因为
 * 实例引用还在（`initializeMasonry` 只在 `!this.masonry` 时初始化）而跳过重建，直到下一次增删
 * 便签触发 `reloadItems` 才恢复。这里在挂载后检查实例是否已被销毁，是就强制重建。
 */
export const StickiesMasonry = forwardRef<TStickiesMasonryHandle, Props>(function StickiesMasonry(props, ref) {
  const { children } = props;
  // refs
  const masonryRef = useRef<any>(null);

  useEffect(() => {
    const component = masonryRef.current;
    if (!component?.masonry) return;
    // 实例仍然有效（元素上还挂着 outlayer 的实例 id）
    if (component.masonry.element?.outlayerGUID) return;
    component.initializeMasonry(true);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      performLayout: () => masonryRef.current?.performLayout(),
    }),
    []
  );

  return (
    // @ts-expect-error type mismatch here
    <Masonry elementType="div" ref={masonryRef}>
      {children}
    </Masonry>
  );
});
