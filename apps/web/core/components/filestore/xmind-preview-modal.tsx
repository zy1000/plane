import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Input, Modal, Select, Spin, Typography } from "antd";
import { AssetExplorerService } from "@/services/asset-explorer.service";

export type TXmindPreviewAsset = {
  id: string;
  name?: string;
  filename?: string;
  attributes?: {
    name?: string;
  };
};

type TXmindPreviewModalProps = {
  open: boolean;
  asset: TXmindPreviewAsset | null;
  workspaceSlug: string;
  projectId: string;
  onClose: () => void;
};

type TMindMapNodeData = {
  text?: string;
  expand?: boolean;
  uid?: string;
  richText?: boolean;
  note?: string;
  [key: string]: unknown;
};

type TMindMapNode = {
  data?: TMindMapNodeData;
  children?: TMindMapNode[];
  smmVersion?: string;
  [key: string]: unknown;
};

type TMindMapRenderer = {
  expandToNodeUid: (uid: string, callback?: () => void) => void;
  findNodeByUid: (uid: string) => unknown;
  moveNodeToCenter: (node: unknown, resetScale?: boolean) => void;
  setRootNodeCenter: () => void;
  renderTree?: TMindMapNode;
};

type TMindMapInstance = {
  destroy: () => void;
  setData: (data: TMindMapNode) => void;
  render: (callback?: () => void) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  renderer?: TMindMapRenderer;
};

type TMindMapConstructor = {
  new (opt: any): TMindMapInstance;
  usePlugin: (plugin: unknown) => unknown;
  hasPlugin: (plugin: unknown) => number;
};

type TNodeStats = {
  totalNodes: number;
  maxDepth: number;
};

type TSearchIndexItem = {
  uid: string;
  text: string;
  path: string;
  searchText: string;
};

const DEFAULT_EXPAND_DEPTH = -1;
const FULL_EXPAND_DEPTH = -1;
const RICH_TEXT_SMM_VERSION = "0.14.0";
const EXPAND_DEPTH_DEBOUNCE_MS = 150;
const MAX_SEARCH_RESULT_COUNT = 50;

const getAssetDisplayName = (asset: TXmindPreviewAsset | null): string => {
  if (!asset) return "文件";
  return asset.name || asset.filename || asset.attributes?.name || "未命名";
};

const cloneMindMapData = <T,>(data: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as T;
};

const stripHtmlTag = (value: string): string =>
  value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();

const SEARCH_HIGHLIGHT_STYLE =
  "background-color: #fff3a0; color: inherit; border-radius: 2px; padding: 0 1px;";

const highlightKeywordInPlainText = (text: string, keyword: string): ReactNode => {
  const trimmedKeyword = keyword.trim();
  if (!trimmedKeyword) return text;

  const lowerText = text.toLowerCase();
  const lowerKeyword = trimmedKeyword.toLowerCase();
  if (!lowerText.includes(lowerKeyword)) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerKeyword, cursor);
  let partIndex = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }
    parts.push(
      <mark key={`${matchIndex}-${partIndex}`} className="xmind-search-highlight">
        {text.slice(matchIndex, matchIndex + lowerKeyword.length)}
      </mark>
    );
    cursor = matchIndex + lowerKeyword.length;
    matchIndex = lowerText.indexOf(lowerKeyword, cursor);
    partIndex += 1;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
};

const highlightKeywordInHtml = (html: string, keyword: string): string => {
  const lowerKeyword = keyword.toLowerCase();
  if (!lowerKeyword) return html;
  if (typeof document === "undefined") return html;
  const tempEl = document.createElement("div");
  tempEl.innerHTML = html;
  const walk = (root: Node) => {
    const childNodes = Array.from(root.childNodes);
    childNodes.forEach((node) => {
      if (node.nodeType === 1) {
        walk(node);
        return;
      }
      if (node.nodeType !== 3) return;
      const text = node.nodeValue ?? "";
      const lowerText = text.toLowerCase();
      if (!lowerText.includes(lowerKeyword)) return;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let matchIndex = lowerText.indexOf(lowerKeyword, cursor);
      while (matchIndex !== -1) {
        if (matchIndex > cursor) {
          fragment.appendChild(document.createTextNode(text.slice(cursor, matchIndex)));
        }
        const mark = document.createElement("span");
        mark.setAttribute("data-smm-search-highlight", "1");
        mark.setAttribute("style", SEARCH_HIGHLIGHT_STYLE);
        mark.textContent = text.slice(matchIndex, matchIndex + lowerKeyword.length);
        fragment.appendChild(mark);
        cursor = matchIndex + lowerKeyword.length;
        matchIndex = lowerText.indexOf(lowerKeyword, cursor);
      }
      if (cursor < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(cursor)));
      }
      node.parentNode?.replaceChild(fragment, node);
    });
  };
  walk(tempEl);
  return tempEl.innerHTML;
};

const getNodeText = (node: TMindMapNode): string => {
  const rawText = node.data?.text;
  if (typeof rawText !== "string") return "";
  return stripHtmlTag(rawText);
};

const ensureNodeUid = (root: TMindMapNode) => {
  let generatedUid = 0;
  const traverse = (node: TMindMapNode) => {
    if (!node.data) node.data = {};
    if (typeof node.data.uid !== "string" || !node.data.uid) {
      node.data.uid = `xmind-preview-${generatedUid}`;
      generatedUid += 1;
    }
    node.children?.forEach(traverse);
  };
  traverse(root);
};

const markAsRichText = (root: TMindMapNode) => {
  root.smmVersion = RICH_TEXT_SMM_VERSION;
  const traverse = (node: TMindMapNode) => {
    if (!node.data) node.data = {};
    node.data.richText = true;
    node.children?.forEach(traverse);
  };
  traverse(root);
};

const ensureRichTextPluginRegistered = (MindMap: TMindMapConstructor, RichTextPlugin: unknown) => {
  if (MindMap.hasPlugin(RichTextPlugin) === -1) {
    MindMap.usePlugin(RichTextPlugin);
  }
};

const getNodeStats = (root: TMindMapNode): TNodeStats => {
  let totalNodes = 0;
  let maxDepth = 0;

  const traverse = (node: TMindMapNode, depth: number) => {
    totalNodes += 1;
    if (depth > maxDepth) maxDepth = depth;
    node.children?.forEach((child) => traverse(child, depth + 1));
  };

  traverse(root, 1);
  return { totalNodes, maxDepth };
};

const applyExpandDepth = (node: TMindMapNode, maxDepth: number, depth = 1) => {
  if (!node.data) node.data = {};
  node.data.expand = depth < maxDepth;
  node.children?.forEach((child) => applyExpandDepth(child, maxDepth, depth + 1));
};

const setAllNodesExpand = (node: TMindMapNode, expand: boolean) => {
  if (!node.data) node.data = {};
  node.data.expand = expand;
  node.children?.forEach((child) => setAllNodesExpand(child, expand));
};

const applyExpandDepthInPlace = (root: TMindMapNode, maxDepth: number) => {
  const visit = (node: TMindMapNode, depth: number) => {
    if (!node.data) node.data = {};
    node.data.expand = depth < maxDepth;
    node.children?.forEach((child) => visit(child, depth + 1));
  };
  visit(root, 1);
};

const setAllNodesExpandInPlace = (root: TMindMapNode, expand: boolean) => {
  const visit = (node: TMindMapNode) => {
    if (!node.data) node.data = {};
    node.data.expand = expand;
    node.children?.forEach(visit);
  };
  visit(root);
};

const buildSearchIndex = (root: TMindMapNode): TSearchIndexItem[] => {
  const indexItems: TSearchIndexItem[] = [];
  const traverse = (node: TMindMapNode, parentTexts: string[]) => {
    const text = getNodeText(node);
    const uid = node.data?.uid;
    const nextPath = text ? [...parentTexts, text] : parentTexts;
    if (uid && text) {
      const path = nextPath.join(" / ");
      indexItems.push({
        uid,
        text,
        path,
        searchText: `${text} ${path}`.toLowerCase(),
      });
    }
    node.children?.forEach((child) => traverse(child, nextPath));
  };
  traverse(root, []);
  return indexItems;
};

const buildRenderData = (fullData: TMindMapNode, expandDepth: number): TMindMapNode => {
  const renderData = cloneMindMapData(fullData);
  if (expandDepth === FULL_EXPAND_DEPTH) {
    setAllNodesExpand(renderData, true);
  } else {
    applyExpandDepth(renderData, expandDepth);
  }
  return renderData;
};

const getDefaultExpandDepth = (maxDepth: number): number => Math.min(DEFAULT_EXPAND_DEPTH, maxDepth);

const buildExpandDepthOptions = (maxDepth: number) => {
  if (maxDepth <= 0) return [];
  return Array.from({ length: maxDepth }, (_, index) => {
    const depth = index + 1;
    return { value: depth, label: `第${depth}层` };
  });
};

export const XmindPreviewModal = ({
  open,
  asset,
  workspaceSlug,
  projectId,
  onClose,
}: TXmindPreviewModalProps) => {
  const service = useMemo(() => new AssetExplorerService(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<TMindMapInstance | null>(null);
  const fullDataRef = useRef<TMindMapNode | null>(null);
  const pendingDepthRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const currentExpandDepthRef = useRef(FULL_EXPAND_DEPTH);
  const noteTooltipElRef = useRef<HTMLDivElement | null>(null);
  const renderEndHandlerRef = useRef<(() => void) | null>(null);
  const originalNodeTextsRef = useRef<Map<string, string>>(new Map());
  const highlightedKeywordRef = useRef<string>("");
  const normalizedSearchKeywordRef = useRef<string>("");

  const [loading, setLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState("");
  const [nodeStats, setNodeStats] = useState<TNodeStats>({ totalNodes: 0, maxDepth: 0 });
  const [currentExpandDepth, setCurrentExpandDepth] = useState(FULL_EXPAND_DEPTH);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedSearchUid, setSelectedSearchUid] = useState<string | undefined>(undefined);
  const [searchCursor, setSearchCursor] = useState<number | null>(null);
  const [searchIndex, setSearchIndex] = useState<TSearchIndexItem[]>([]);
  const [isModalReady, setIsModalReady] = useState(false);

  const handleModalOpenChange = useCallback((visible: boolean) => {
    setIsModalReady(visible);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!asset?.id) return;
    try {
      const url = await service.getAssetPresignedURL(workspaceSlug, projectId, asset.id, "attachment");
      if (!url) {
        setError("下载失败");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err?.message || "下载失败");
    }
  }, [asset?.id, projectId, service, workspaceSlug]);

  const cancelExpandAll = useCallback(() => {
    pendingDepthRef.current = null;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const detachRenderEndListener = useCallback(() => {
    const mindMap = mindMapRef.current;
    const handler = renderEndHandlerRef.current;
    if (mindMap && handler) {
      mindMap.off("node_tree_render_end", handler);
    }
    renderEndHandlerRef.current = null;
  }, []);

  const attachRenderEndListener = useCallback(
    (mindMap: TMindMapInstance) => {
      detachRenderEndListener();
      const handleRenderEnd = () => {
        setIsRendering(false);
      };
      renderEndHandlerRef.current = handleRenderEnd;
      mindMap.on("node_tree_render_end", handleRenderEnd);
    },
    [detachRenderEndListener]
  );

  const markSearchHighlightNodesForUpdate = useCallback((root: TMindMapNode) => {
    let mutated = false;
    const visit = (node: TMindMapNode) => {
      const uid = node.data?.uid;
      if (uid && originalNodeTextsRef.current.has(uid) && node.data) {
        node.data.needUpdate = true;
        mutated = true;
      }
      node.children?.forEach(visit);
    };
    visit(root);
    return mutated;
  }, []);

  const applySearchHighlight = useCallback(
    (keyword: string, options?: { force?: boolean }) => {
      const mindMap = mindMapRef.current;
      const renderTree = mindMap?.renderer?.renderTree;
      if (!mindMap || !renderTree) return;

      const lowerKeyword = keyword.toLowerCase();
      const force = options?.force ?? false;

      if (!force && highlightedKeywordRef.current === lowerKeyword) return;

      if (force && lowerKeyword && highlightedKeywordRef.current === lowerKeyword) {
        if (markSearchHighlightNodesForUpdate(renderTree)) {
          mindMap.render();
        }
        return;
      }

      let mutated = false;
      const markNeedUpdate = (node: TMindMapNode) => {
        if (!node.data) node.data = {};
        node.data.needUpdate = true;
        mutated = true;
      };

      if (originalNodeTextsRef.current.size > 0) {
        const restore = (node: TMindMapNode) => {
          const uid = node.data?.uid;
          if (uid && originalNodeTextsRef.current.has(uid) && node.data) {
            node.data.text = originalNodeTextsRef.current.get(uid);
            markNeedUpdate(node);
          }
          node.children?.forEach(restore);
        };
        restore(renderTree);
        originalNodeTextsRef.current.clear();
      }

      if (lowerKeyword) {
        const apply = (node: TMindMapNode) => {
          const uid = node.data?.uid;
          const text = node.data?.text;
          if (uid && typeof text === "string" && node.data) {
            if (stripHtmlTag(text).toLowerCase().includes(lowerKeyword)) {
              originalNodeTextsRef.current.set(uid, text);
              node.data.text = highlightKeywordInHtml(text, keyword);
              markNeedUpdate(node);
            }
          }
          node.children?.forEach(apply);
        };
        apply(renderTree);
      }

      highlightedKeywordRef.current = lowerKeyword;
      if (mutated) mindMap.render();
    },
    [markSearchHighlightNodesForUpdate]
  );

  const locateNodeByUid = useCallback((uid: string) => {
    if (!uid) return;
    const renderer = mindMapRef.current?.renderer;
    if (!renderer) return;
    renderer.expandToNodeUid(uid, () => {
      const targetNode = renderer.findNodeByUid(uid);
      if (targetNode) {
        renderer.moveNodeToCenter(targetNode, false);
      }
      if (normalizedSearchKeywordRef.current) {
        applySearchHighlight(normalizedSearchKeywordRef.current, { force: true });
      }
    });
  }, [applySearchHighlight]);

  const handleLocateCenterNode = useCallback(() => {
    const renderer = mindMapRef.current?.renderer;
    if (!renderer) return;
    renderer.setRootNodeCenter();
  }, []);

  const handleSetExpandDepth = useCallback(
    (expandDepth: number) => {
      const mindMap = mindMapRef.current;
      const renderTree = mindMap?.renderer?.renderTree;
      if (!mindMap || !renderTree) return;
      if (expandDepth === currentExpandDepthRef.current) return;

      cancelExpandAll();
      setIsRendering(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (mindMapRef.current !== mindMap) return;
          if (expandDepth === FULL_EXPAND_DEPTH) {
            setAllNodesExpandInPlace(renderTree, true);
          } else {
            applyExpandDepthInPlace(renderTree, expandDepth);
          }

          const prevDepth = currentExpandDepthRef.current;
          const isShrinking =
            (prevDepth === FULL_EXPAND_DEPTH && expandDepth !== FULL_EXPAND_DEPTH) ||
            (prevDepth !== FULL_EXPAND_DEPTH &&
              expandDepth !== FULL_EXPAND_DEPTH &&
              expandDepth < prevDepth);

          currentExpandDepthRef.current = expandDepth;
          setCurrentExpandDepth(expandDepth);
          mindMap.render(() => {
            if (mindMapRef.current !== mindMap) return;
            if (isShrinking) {
              mindMap.renderer?.setRootNodeCenter();
            }
            if (normalizedSearchKeywordRef.current) {
              applySearchHighlight(normalizedSearchKeywordRef.current, { force: true });
            }
          });
        });
      });
    },
    [applySearchHighlight, cancelExpandAll]
  );

  const scheduleExpandDepth = useCallback(
    (depth: number) => {
      pendingDepthRef.current = depth;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        const nextDepth = pendingDepthRef.current;
        pendingDepthRef.current = null;
        debounceTimerRef.current = null;
        if (nextDepth !== null) handleSetExpandDepth(nextDepth);
      }, EXPAND_DEPTH_DEBOUNCE_MS);
    },
    [handleSetExpandDepth]
  );

  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedSearchKeyword) return [];
    return searchIndex.filter((item) => item.searchText.includes(normalizedSearchKeyword)).slice(0, MAX_SEARCH_RESULT_COUNT);
  }, [normalizedSearchKeyword, searchIndex]);

  const searchOptions = useMemo(
    () =>
      searchResults.map((item) => ({
        value: item.uid,
        label: item.path,
      })),
    [searchResults]
  );

  const handleSearchResultSelect = useCallback(
    (uid: string) => {
      if (!uid) return;
      setSelectedSearchUid(uid);
      setSearchCursor(searchResults.findIndex((item) => item.uid === uid));
      locateNodeByUid(uid);
    },
    [locateNodeByUid, searchResults]
  );

  const handleLocateNextMatch = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = searchCursor === null ? 0 : (searchCursor + 1) % searchResults.length;
    const target = searchResults[nextIndex];
    setSearchCursor(nextIndex);
    setSelectedSearchUid(target.uid);
    locateNodeByUid(target.uid);
  }, [locateNodeByUid, searchCursor, searchResults]);

  useEffect(() => {
    setSelectedSearchUid(undefined);
    setSearchCursor(null);
  }, [searchKeyword]);

  useEffect(() => {
    normalizedSearchKeywordRef.current = normalizedSearchKeyword;
    applySearchHighlight(normalizedSearchKeyword);
  }, [applySearchHighlight, normalizedSearchKeyword]);

  useEffect(() => {
    currentExpandDepthRef.current = currentExpandDepth;
  }, [currentExpandDepth]);

  useEffect(() => {
    if (!open || !isModalReady || !asset?.id) return;

    const abortController = new AbortController();
    let disposed = false;
    let detachRightDragCursorHandlers: (() => void) | null = null;

    const load = async () => {
      cancelExpandAll();
      detachRightDragCursorHandlers?.();
      detachRightDragCursorHandlers = null;
      setLoading(true);
      setIsRendering(false);
      setError("");
      setNodeStats({ totalNodes: 0, maxDepth: 0 });
      setCurrentExpandDepth(FULL_EXPAND_DEPTH);
      setSearchKeyword("");
      setSelectedSearchUid(undefined);
      setSearchCursor(null);
      setSearchIndex([]);
      originalNodeTextsRef.current.clear();
      highlightedKeywordRef.current = "";
      fullDataRef.current = null;

      try {
        mindMapRef.current?.destroy();
      } catch {
        // ignore destroy errors on stale instances
      }
      mindMapRef.current = null;

      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }

      try {
        const url = await service.getAssetPresignedURL(workspaceSlug, projectId, asset.id, "inline");
        if (!url) throw new Error("获取文件地址失败");

        const res = await fetch(url, { signal: abortController.signal });
        if (!res.ok) throw new Error("下载文件失败");

        const blob = await res.blob();

        const [
          { default: MindMapModule },
          { default: RichTextPlugin },
          { default: xmindParser },
        ] = await Promise.all([
          import("simple-mind-map"),
          import("simple-mind-map/src/plugins/RichText.js"),
          import("simple-mind-map/src/parse/xmind.js"),
        ]);
        const MindMap = MindMapModule as unknown as TMindMapConstructor;
        ensureRichTextPluginRegistered(MindMap, RichTextPlugin);

        if (disposed || !containerRef.current) return;

        const parsedData = (await xmindParser.parseXmindFile(blob, undefined)) as TMindMapNode;
        if (disposed || !containerRef.current) return;

        if (!parsedData || typeof parsedData !== "object") {
          throw new Error("XMind 文件数据格式异常");
        }

        const fullData = cloneMindMapData(parsedData);
        ensureNodeUid(fullData);
        markAsRichText(fullData);

        const stats = getNodeStats(fullData);
        const initialExpandDepth = getDefaultExpandDepth(stats.maxDepth);
        const initialRenderData = buildRenderData(fullData, initialExpandDepth);

        fullDataRef.current = fullData;
        setNodeStats(stats);
        setCurrentExpandDepth(initialExpandDepth);
        setSearchIndex(buildSearchIndex(fullData));

        if (!noteTooltipElRef.current) {
          const tooltipEl = document.createElement("div");
          tooltipEl.className = "smm-xmind-note-tooltip";
          tooltipEl.style.cssText = `
            position: fixed;
            max-width: 360px;
            max-height: 60vh;
            overflow: auto;
            padding: 10px 12px;
            border-radius: 6px;
            box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
            background-color: #fff;
            color: #333;
            font-size: 13px;
            line-height: 1.6;
            word-break: break-word;
            white-space: normal;
            display: none;
            z-index: 3100;
            pointer-events: none;
          `;
          document.body.appendChild(tooltipEl);
          noteTooltipElRef.current = tooltipEl;
        }

        const mindMap = new MindMap({
          el: containerRef.current,
          data: initialRenderData,
          readonly: true,
          enableDragModifyNodeWidth: false,
          useLeftKeySelectionRightKeyDrag: true,
          mousewheelAction: "move",
          // 节点较多（数百以上）时开启性能模式，仅渲染可视区域内的节点，
          // 显著降低拖动/缩放时的重渲染开销
          openPerformance: true,
          performanceConfig: {
            time: 250,
            padding: 200,
            removeNodeWhenOutCanvas: true,
          },
          customNoteContentShow: {
            show: (note: string, left: number, top: number) => {
              const tooltipEl = noteTooltipElRef.current;
              if (!tooltipEl) return;
              tooltipEl.innerHTML = typeof note === "string" ? note : "";
              tooltipEl.style.left = `${left}px`;
              tooltipEl.style.top = `${top}px`;
              tooltipEl.style.display = "block";
            },
            hide: () => {
              const tooltipEl = noteTooltipElRef.current;
              if (!tooltipEl) return;
              tooltipEl.style.display = "none";
            },
          },
        });
        mindMapRef.current = mindMap;
        currentExpandDepthRef.current = initialExpandDepth;
        attachRenderEndListener(mindMap);

        if (normalizedSearchKeywordRef.current) {
          applySearchHighlight(normalizedSearchKeywordRef.current);
        }

        const container = containerRef.current;
        const resetDragCursor = () => {
          if (container) container.style.cursor = "";
        };
        const handleRightMouseDown = (e: MouseEvent) => {
          if (e.button === 2 && container) {
            container.style.cursor = "grabbing";
          }
        };
        const handleRightMouseUp = () => {
          resetDragCursor();
        };
        const handleContextMenu = (e: MouseEvent) => {
          e.preventDefault();
        };
        container.addEventListener("mousedown", handleRightMouseDown);
        container.addEventListener("mouseleave", handleRightMouseUp);
        window.addEventListener("mouseup", handleRightMouseUp);
        container.addEventListener("contextmenu", handleContextMenu);
        detachRightDragCursorHandlers = () => {
          container.removeEventListener("mousedown", handleRightMouseDown);
          container.removeEventListener("mouseleave", handleRightMouseUp);
          window.removeEventListener("mouseup", handleRightMouseUp);
          container.removeEventListener("contextmenu", handleContextMenu);
          resetDragCursor();
        };
      } catch (err: any) {
        if (abortController.signal.aborted || disposed) return;
        setError(err?.message || "解析 .xmind 失败");
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();

    return () => {
      disposed = true;
      abortController.abort();
      cancelExpandAll();
      detachRenderEndListener();
      detachRightDragCursorHandlers?.();
      fullDataRef.current = null;
      try {
        mindMapRef.current?.destroy();
      } catch {
        // ignore destroy errors on unmount
      }
      mindMapRef.current = null;
      if (noteTooltipElRef.current) {
        try {
          noteTooltipElRef.current.remove();
        } catch {
          // ignore remove errors on stale tooltip elements
        }
        noteTooltipElRef.current = null;
      }
    };
  }, [
    asset?.id,
    attachRenderEndListener,
    cancelExpandAll,
    detachRenderEndListener,
    isModalReady,
    open,
    projectId,
    service,
    workspaceSlug,
  ]);

  const displayName = getAssetDisplayName(asset);
  const canOperateMindMap = nodeStats.totalNodes > 0 && !loading && !error && !isRendering;
  const expandDepthOptions = useMemo(() => buildExpandDepthOptions(nodeStats.maxDepth), [nodeStats.maxDepth]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={handleModalOpenChange}
      footer={null}
      width="100vw"
      style={{ top: 0, paddingBottom: 0 }}
      bodyStyle={{ padding: 0 }}
      destroyOnClose
      title={<Typography.Text strong>{`预览：${displayName}`}</Typography.Text>}
    >
      <div className="flex h-full flex-col" style={{ height: "calc(100vh - 56px)" }}>
        {nodeStats.totalNodes > 0 && !error && (
          <div className="z-20 border-b border-custom-border-200 bg-custom-background-100 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Text type="secondary">
                {`共 ${nodeStats.totalNodes} 个节点，最大深度 ${nodeStats.maxDepth}`}
              </Typography.Text>
              {expandDepthOptions.length > 0 && (
                <Select
                  size="small"
                  style={{ width: 120 }}
                  value={currentExpandDepth === FULL_EXPAND_DEPTH ? undefined : currentExpandDepth}
                  disabled={!canOperateMindMap || isRendering}
                  options={expandDepthOptions}
                  placeholder="选择层级"
                  onChange={(depth) => scheduleExpandDepth(Number(depth))}
                />
              )}
              <Button size="small" disabled={!canOperateMindMap} onClick={handleLocateCenterNode}>
                定位中心节点
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Input
                  size="small"
                  allowClear
                  placeholder="搜索节点文本"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  style={{ width: 220 }}
                />
                <Select
                  size="small"
                  style={{ width: 360, maxWidth: "100%" }}
                  value={selectedSearchUid}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  disabled={!searchKeyword.trim() || searchOptions.length === 0}
                  options={searchOptions}
                  placeholder={searchKeyword.trim() ? `匹配 ${searchOptions.length} 个节点` : "先输入关键词"}
                  optionRender={(option) => (
                    <span>{highlightKeywordInPlainText(String(option.label ?? ""), searchKeyword)}</span>
                  )}
                  onClear={() => setSelectedSearchUid(undefined)}
                  onChange={(value) => handleSearchResultSelect(String(value))}
                />
                <Button size="small" disabled={searchOptions.length === 0} onClick={handleLocateNextMatch}>
                  {searchCursor === null ? "定位首个" : "定位下一个"}
                </Button>
                {searchCursor !== null && searchResults.length > 0 && (
                  <Typography.Text type="secondary">{`${searchCursor + 1}/${searchResults.length}`}</Typography.Text>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="relative flex-1">
          {error && (
            <div className="absolute left-0 right-0 top-0 z-20 p-3">
              <Alert
                type="error"
                showIcon
                message="预览异常"
                description={
                  <div className="flex flex-col gap-2">
                    <span>{error}</span>
                    <Button size="small" onClick={() => void handleDownload()}>
                      下载原文件
                    </Button>
                  </div>
                }
              />
            </div>
          )}
          {(loading || isRendering) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Spin size="large" tip={loading ? "加载中..." : "正在展开节点，请稍候..."} />
            </div>
          )}
          <div ref={containerRef} className="xmind-preview-container h-full w-full" />
          <style>{`
            .xmind-preview-container [data-smm-search-highlight="1"] {
              background-color: #fff3a0;
              color: inherit;
              border-radius: 2px;
              padding: 0 1px;
            }
            .xmind-search-highlight {
              background-color: #fff3a0;
              color: inherit;
              border-radius: 2px;
              padding: 0 1px;
            }
          `}</style>
        </div>
      </div>
    </Modal>
  );
};
