import { useCallback } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";

/**
 * 按住**右键**在时间轴上拖动，整张图跟着平移（横竖都能）。
 *
 * 用右键是因为左键在未排期的行上是「拖出一条排期」，平移时手一快就会误建；
 * 链接、按钮和条（`data-plan-bar`）上按下不平移，条上的右键留给它自己的菜单。
 */
export const usePlanPan = (scrollRef: RefObject<HTMLDivElement | null>) => {
  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      const element = scrollRef.current;
      if (!element || event.button !== 2) return;
      if ((event.target as HTMLElement).closest("a, button, [data-plan-bar]")) return;
      event.preventDefault();
      let lastX = event.clientX;
      let lastY = event.clientY;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      const handleMove = (moveEvent: PointerEvent) => {
        element.scrollLeft -= moveEvent.clientX - lastX;
        element.scrollTop -= moveEvent.clientY - lastY;
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
      };
      const stop = () => {
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
    [scrollRef]
  );

  /** 右键用来平移了，空白处不弹浏览器菜单 */
  const onContextMenu = useCallback((event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest("a, button, [data-plan-bar]")) return;
    event.preventDefault();
  }, []);

  return { onPointerDown, onContextMenu };
};
