/** 标题旁的数量胶囊：「全部分类 4」「一级模块 7」 */
export function CountPill({ count }: { count: number }) {
  return (
    <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-layer-1 px-[7px] text-12 tabular-nums text-secondary">
      {count}
    </span>
  );
}
