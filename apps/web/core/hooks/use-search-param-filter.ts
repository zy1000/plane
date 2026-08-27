import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

/** 首帧的哨兵：不能用 null，因为「参数不存在」本身就是 null */
const UNINITIALIZED = Symbol("uninitialized");

/**
 * 把一个「可为空的筛选值」与一个 URL 查询参数双向绑定。
 *
 * 两个方向都必须有，而且必须能互相区分，否则会打架：
 * - URL → state：前进后退、粘贴链接、刷新。
 * - state → URL：用户点了筛选。
 *
 * `syncedRef` 记的是**最后一次由本地写出去的原始字符串**。少了它，自己写出去的那次
 * 变更会在下一帧当作「外面改的」回灌进来，值会来回跳一次。
 *
 * 两个已经踩过的坑，改这里之前先看清楚：
 *
 * 1. `syncedRef` 的初值必须是哨兵，**不能是首帧的 raw**。用 raw 的话首帧
 *    `raw === syncedRef.current` 恒成立，URL→state 直接短路，state 永远拿不到深链里的
 *    值；紧接着 state→URL 看到 state 还是空的，就把参数删掉 —— 于是每一个带筛选的
 *    链接一打开就被自己抹平。
 *
 * 2. 写 URL 必须用 `setSearchParams` 的**函数式更新**。三个实例（product / stage /
 *    type）会在同一次提交里各写各的，如果各自从自己渲染时捕获的 `searchParams` 快照
 *    重建查询串，最后一个写入会把前两个的参数一起丢掉。函数式更新拿到的是最新值。
 */
export const useSearchParamFilter = <T extends string>({
  param,
  value,
  setValue,
  parse,
}: {
  param: string;
  value: T | undefined;
  setValue: (next: T | undefined) => void;
  parse: (raw: string | null) => T | undefined;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(param);
  const syncedRef = useRef<string | null | typeof UNINITIALIZED>(UNINITIALIZED);

  // URL → state。首帧必定跑一次，把深链里的值灌进 state
  useEffect(() => {
    if (raw === syncedRef.current) return;
    syncedRef.current = raw;
    setValue(parse(raw));
    // setValue / parse 每次渲染都是新引用，进依赖数组会让这个副作用每帧都跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // state → URL
  useEffect(() => {
    // 首帧还没把 URL 读进 state，此时 state 一定是空的，不能拿它去删参数
    if (syncedRef.current === UNINITIALIZED) return;
    const next = value ?? null;
    if (next === raw) return;
    syncedRef.current = next;
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next) params.set(param, next);
        else params.delete(param);
        return params;
      },
      { replace: true }
    );
  }, [value, raw, param, setSearchParams]);
};
