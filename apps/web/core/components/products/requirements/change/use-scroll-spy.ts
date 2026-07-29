/**
 * 区块导航的滚动监听：内容滚动区内哪个区块越过视口上沿判定线，导航就高亮哪个。
 * 取代「永远高亮第一项」的假状态。root 为内部滚动容器（overflow-y-auto），
 * 区块元素按 id 在 document 内即时查询。
 *
 * enabled 必须在「滚动容器已渲染且快照数据就绪」后才置真 —— 加载/错误等
 * 早退分支下容器根本不在 DOM 里，effect 拿不到元素会永久挂空监听。
 */
import { useEffect, useState, type RefObject } from "react";

export const useScrollSpy = (ids: readonly string[], rootRef: RefObject<HTMLElement | null>, enabled = true) => {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const pickActive = () => {
      const sections = ids
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element !== null);
      if (!sections.length) return;
      // 滚到底时末位区块可能永远够不到判定线（内容太短），直接视为当前
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        setActiveId(sections[sections.length - 1].id);
        return;
      }
      // 判定线取滚动区上沿向下 1/3 处，最后一条越过判定线的区块视为当前
      const threshold = root.getBoundingClientRect().top + root.clientHeight / 3;
      let current = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= threshold) current = section.id;
      }
      setActiveId(current);
    };

    pickActive();
    root.addEventListener("scroll", pickActive, { passive: true });
    window.addEventListener("resize", pickActive);
    return () => {
      root.removeEventListener("scroll", pickActive);
      window.removeEventListener("resize", pickActive);
    };
  }, [enabled, ids, rootRef]);

  return activeId;
};
