import { useCallback, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { TRequirementFormRow } from "@plane/types";

/**
 * 子表单行的拖拽重排。详情页/建行弹窗的子表单区与需求网格共用。
 *
 * 手感照着测试用例详情里的「测试步骤」表：按住行首的编号格拖整行，落点画一条插入线。
 *
 * 行顺序就是 data[formId] 这个数组的下标顺序（没有 sort_order 列），所以重排就是重排
 * 数组，写回走各自原有的保存链路（详情页 onChange -> PATCH，网格 autosave -> bulk-save）。
 *
 * 为什么不用 @plane/ui 的 Sortable：它给每一项包一层 <div>，塞不进 <tbody>。两处子表单
 * 都是原生 table，只能自己往 <tr> / <td> 上挂 pragmatic-dnd。
 */

export type TSubformDropEdge = "top" | "bottom";

type TRowPayload = {
  /** 拖拽作用域。详情页用 formId，网格用 `${requirementId}:${formId}` —— 跨子表单、跨需求不能互拖 */
  groupId: string;
  rowId: string;
  /**
   * 这一行的视觉标识。一行可以挂多个放置目标（网格里整组单元格都接放置，好让落点范围
   * 跟测试步骤一样是整行），它们共用同一个 rowKey，isDragging / dropEdgeOf 都按它查。
   */
  rowKey: string;
};

/**
 * 把 sourceRowId 挪到 targetRowId 的上/下方。
 *
 * 索引修正照抄 packages/ui/src/sortable/sortable.tsx：先把源行摘出来会让它后面的下标
 * 整体前移一位，所以目标位在源行之后时要减一。
 */
export const moveFormRow = (
  rows: TRequirementFormRow[],
  sourceRowId: string,
  targetRowId: string,
  edge: TSubformDropEdge
): TRequirementFormRow[] => {
  const sourceIndex = rows.findIndex((row) => row.id === sourceRowId);
  const targetIndex = rows.findIndex((row) => row.id === targetRowId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return rows;

  const insertIndex = edge === "bottom" ? targetIndex + 1 : targetIndex;
  const adjustedIndex = insertIndex > sourceIndex ? insertIndex - 1 : insertIndex;
  if (adjustedIndex === sourceIndex) return rows;

  const next = [...rows];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(adjustedIndex, 0, moved);
  return next;
};

/**
 * 插入位置指示线，与测试步骤那张表同一种做法。
 *
 * 用 inset 阴影而不是 border：单元格是 border-collapse + overflow-hidden，加边框会把整行
 * 顶动 2px，阴影不占位。
 */
export const getSubformDropEdgeClass = (edge: TSubformDropEdge | null) => {
  if (edge === "top") return "shadow-[inset_0_2px_0_0_var(--bg-accent-primary)]";
  if (edge === "bottom") return "shadow-[inset_0_-2px_0_0_var(--bg-accent-primary)]";
  return "";
};

type TArgs = {
  onReorder: (payload: {
    groupId: string;
    sourceRowId: string;
    targetRowId: string;
    edge: TSubformDropEdge;
  }) => void;
};

/**
 * 注册表式的拖拽挂载器 —— 在组件顶层调一次，每个参与拖放的元素拿一个 ref 回调。
 *
 * `getRowRef` 挂「可拖 + 可放」的元素（详情页是整条 <tr>，网格是编号格），
 * `getDropRef` 挂「只可放」的元素（网格里同一组的其余单元格）。
 *
 * 不做成「每行一个 hook」是因为两处的行都在 .map() 里就地渲染，行数随数据变化，循环里
 * 调 hook 会违反 hooks 规则；而 React 18 的 ref 回调又不支持返回 cleanup，所以自己用一张
 * Map 记住每个元素挂在哪个节点上、怎么卸载。
 *
 * ref 回调按 elementKey 缓存成稳定引用是必须的：每次渲染换一个新函数，React 会先用旧函数
 * 传 null 再用新函数传节点，等于每次渲染都重挂一遍 —— 拖拽过程中本身就在 setState 重渲染，
 * 重挂会把拖到一半的手势弄断。因为缓存了，`canDrag` 是首次注册时定死的；两处调用点的角色
 * 都是固定的（编号格恒可拖、数据格恒只可放），不存在中途翻转。
 */
export const useSubformRowDnd = ({ onReorder }: TArgs) => {
  const [draggingRowKey, setDraggingRowKey] = useState<string | null>(null);
  /**
   * 记 elementKey 是为了判「该不该由我来收手」：同一行挂了多个放置目标，从 A 格移到 B 格
   * 会先后触发 B 的 onDrag 与 A 的 onDragLeave，只按 rowKey 判的话 A 会把 B 刚点亮的
   * 指示线又抹掉。
   */
  const [dropHint, setDropHint] = useState<
    { elementKey: string; rowKey: string; edge: TSubformDropEdge } | null
  >(null);
  const registryRef = useRef(new Map<string, { element: HTMLElement; cleanup: () => void }>());
  const refCacheRef = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const payloadsRef = useRef(new Map<string, TRowPayload>());
  /** 回调每次渲染都是新的，但注册只做一次，所以走 ref 取最新的那个 */
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  /*
   * 这里**不要**加一个「卸载时把 registry 一把清掉」的 useEffect。
   *
   * 清理已经由 ref 回调逐个完成了：React 在元素卸载时会拿 null 再调一次 ref，attach(null)
   * 那条分支就把这一个注册摘掉。整体清理不仅多余，在 StrictMode 下还是灾难 —— React 18
   * 开发模式会把 effect 跑两遍（挂载 → 模拟卸载 → 再挂载），但 ref 回调不会重跑。于是挂载
   * 时就在的行先注册成功、紧接着被那个 cleanup 全部注销，再也没人把它们挂回去；只有后来
   * 才渲染出来的行（比如点「添加行」新建的）能用。网格首帧是骨架屏、行是数据回来后才
   * 渲染的，恰好躲过了这一轮；抽屉有 seed、首帧就出行，正好撞上。
   */

  const register = useCallback((elementKey: string, payload: TRowPayload, canDrag: boolean) => {
    payloadsRef.current.set(elementKey, payload);
    const cached = refCacheRef.current.get(elementKey);
    if (cached) return cached;

    const attach = (element: HTMLElement | null) => {
      const registry = registryRef.current;
      const existing = registry.get(elementKey);
      if (existing?.element === element) return;
      if (existing) {
        existing.cleanup();
        registry.delete(elementKey);
      }
      if (!element) {
        // 只摘注册，**不能**顺手把 refCache / payloads 也删掉。
        //
        // 网格的 <tr> key 是 getRequirementRowKey 拿「各子表单在该位置的行 id」拼出来的
        // （requirement-grid-shared.tsx:49），拖完一次顺序 key 就变了，整条 <tr> 连同这里的
        // 单元格会在同一次提交里先卸载再挂载。React 的顺序是 render（写 payload）-> 卸载
        // （走到这里）-> 挂载，删掉 payload 的话紧接着那次注册就读到 undefined，
        // getInitialData 少了 groupId/rowId，canDrop 恒假 —— 这一行从此拖不动。
        //
        // 留下的两条记录是一个闭包加一个小对象，上限是这个实例渲染过的行数，不用清。
        return;
      }

      const current = () => payloadsRef.current.get(elementKey);
      const dropTarget = dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          source.data.groupId === current()?.groupId && source.data.rowId !== current()?.rowId,
        getData: ({ input, element: target }) =>
          attachClosestEdge(
            { ...current(), elementKey },
            { input, element: target, allowedEdges: ["top", "bottom"] }
          ),
        onDrag: (args) => {
          const edge = extractClosestEdge(args.self.data);
          const payloadNow = current();
          if (!payloadNow || (edge !== "top" && edge !== "bottom")) return;
          setDropHint((hint) =>
            hint?.elementKey === elementKey && hint.edge === edge
              ? hint
              : { elementKey, rowKey: payloadNow.rowKey, edge }
          );
        },
        onDragLeave: () => setDropHint((hint) => (hint?.elementKey === elementKey ? null : hint)),
        onDrop: ({ source, self }) => {
          setDropHint(null);
          const payloadNow = current();
          const edge = extractClosestEdge(self.data);
          const sourceRowId = source.data.rowId;
          if (!payloadNow || (edge !== "top" && edge !== "bottom")) return;
          if (typeof sourceRowId !== "string" || sourceRowId === payloadNow.rowId) return;
          onReorderRef.current({
            groupId: payloadNow.groupId,
            sourceRowId,
            targetRowId: payloadNow.rowId,
            edge,
          });
        },
      });

      /*
       * 刻意**不用** pragmatic 的 dragHandle 去收窄拖拽起点。
       *
       * 可拖的元素本来就只有编号格（数据格走 getDropRef，只放不拖），拖拽区域已经在结构上
       * 收窄过了，再收一次是多余的；而它的代价是一个静默失败点：dragHandle 是在 dragstart
       * 时拿 elementFromPoint 取指针底下的元素、再判 dragHandle.contains(它)，不通过就
       * preventDefault 掉整次拖拽，不留任何痕迹（element-adapter.js:139-149）。把手若靠
       * absolute inset-0 撑开，就得指望 <td> 给得出确定高度 —— 网格那格有 h-11，抽屉那格是
       * 自动高度，抽屉里「怎么拖都没反应」就是这么来的。
       */
      const cleanup = canDrag
        ? combine(
            draggable({
              element,
              getInitialData: () => ({ ...current(), elementKey }),
              onDragStart: () => setDraggingRowKey(current()?.rowKey ?? null),
              onDrop: () => {
                setDraggingRowKey(null);
                setDropHint(null);
              },
            }),
            dropTarget
          )
        : dropTarget;
      registry.set(elementKey, { element, cleanup });
    };

    refCacheRef.current.set(elementKey, attach);
    return attach;
  }, []);

  const getRowRef = useCallback(
    (elementKey: string, payload: TRowPayload) => register(elementKey, payload, true),
    [register]
  );
  const getDropRef = useCallback(
    (elementKey: string, payload: TRowPayload) => register(elementKey, payload, false),
    [register]
  );

  const isDragging = useCallback((rowKey: string) => draggingRowKey === rowKey, [draggingRowKey]);
  const dropEdgeOf = useCallback(
    (rowKey: string): TSubformDropEdge | null => (dropHint?.rowKey === rowKey ? dropHint.edge : null),
    [dropHint]
  );

  return { getRowRef, getDropRef, isDragging, dropEdgeOf };
};
