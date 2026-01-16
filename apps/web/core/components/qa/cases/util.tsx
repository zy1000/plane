// 顶部 import 位置
import {
  DeleteOutlined,
  ExpandAltOutlined,
  PlusOutlined,
  MoreOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CopyOutlined,
  EllipsisOutlined,
} from "@ant-design/icons";
import { Button, Input, Modal, Popover } from "antd";
import React, { useEffect, useState, useRef } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css"; // 引入默认样式
export const RichTextEditor = ({
  value,
  onChange,
  onBlur,
  placeholder = "请输入内容...",
  editable = true,
}: {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  editable?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const quillRef = useRef<ReactQuill | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const hasContent = (() => {
    if (!value) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    const hasMedia = /<(img|video|iframe|embed|object|svg)\b/i.test(trimmed);
    if (hasMedia) return true;
    const text = trimmed
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim();
    return text.length > 0;
  })();
  // 定义工具栏配置
  const modules = {
    toolbar: [
      [
        {
          size: [
            "extra-small", // 额外小
            "small", // 小
            false, // 默认
            "large", // 大
            "extra-large", // 超大
            "2x-large", // 2倍大
            "3x-large", // 3倍大
          ],
        },
      ],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }],
      [{ script: "sub" }, { script: "super" }],
      [{ align: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["blockquote", "code-block"],
      ["link", "image"],
      ["clean"],
    ],
  };

  // 定义允许的格式
  const formats = [
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "script",
    "align",
    "list",
    "bullet",
    "indent",
    "blockquote",
    "code-block",
    "link",
    "image",
    "video",
  ];

  // 新增：阻止按键事件冒泡，避免触发全局快捷键
  const stopGlobalHotkeys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };
  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        try {
          (quillRef.current as any)?.getEditor?.()?.focus?.();
        } catch {}
      }, 0);
    }
  }, [editing]);
  useEffect(() => {
    const maxH = 160;
    if (editing) {
      setOverflowing(false);
      return;
    }
    const el = contentRef.current;
    if (!el) {
      setOverflowing(false);
      return;
    }

    const checkOverflow = () => {
      if (editing) return;
      const next = el.scrollHeight > maxH + 1;
      setOverflowing(next);
    };

    // 立即检查一次
    checkOverflow();

    // 监听图片加载
    const images = el.getElementsByTagName("img");
    for (let i = 0; i < images.length; i++) {
      images[i].addEventListener("load", checkOverflow);
    }

    // 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      for (let i = 0; i < images.length; i++) {
        images[i].removeEventListener("load", checkOverflow);
      }
    };
  }, [value, expanded, editing]);
  useEffect(() => {
    if (!editing) return;
    const isInQuillPicker = (node: Node | null): boolean => {
      let el = node as HTMLElement | null;
      while (el) {
        if (el.classList?.contains?.("ql-picker") || el.classList?.contains?.("ql-tooltip")) return true;
        el = el.parentElement;
      }
      return false;
    };
    const handler = (ev: MouseEvent | TouchEvent) => {
      const target = ev.target as Node | null;
      if (wrapperRef.current && target && (wrapperRef.current.contains(target) || isInQuillPicker(target))) return;
      setEditing(false);
      onBlur?.();
    };
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, [editing, onBlur]);
  const handleWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    const isPickerFocus = (() => {
      let el = next as HTMLElement | null;
      while (el) {
        if (el.classList?.contains?.("ql-picker") || el.classList?.contains?.("ql-tooltip")) return true;
        el = el.parentElement;
      }
      return false;
    })();
    if ((next && wrapperRef.current?.contains(next)) || isPickerFocus) return;
    if (editing) {
      setEditing(false);
      onBlur?.();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editing || !wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) {
        // 阻止所有在编辑器内的按键事件冒泡
        e.stopPropagation();

        if (e.key === "Escape") {
          setEditing(false);
          onBlur?.();
        }
      }
    };

    if (editing) {
      // 使用捕获阶段确保优先处理
      document.addEventListener("keydown", handleKeyDown, true);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editing, onBlur]);

  return (
    <div ref={wrapperRef} onBlur={handleWrapperBlur}>
      <style>{`
        .qa-quill {
          --qaq-bg: #ffffff;
          --qaq-toolbar-bg: #f7f8fa;
          --qaq-border: #e5e7eb;
          --qaq-primary: var(--ant-primary-color, #1677ff);
          --qaq-text: #1f2937;
          --qaq-muted: #6b7280;
          --qaq-hover: rgba(22, 119, 255, 0.08);
          --qaq-radius: 8px;
        }

        .qa-quill {
          border: 1px solid var(--qaq-border);
          border-radius: var(--qaq-radius);
          background: var(--qaq-bg);
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .qa-quill:focus-within {
          box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
          border-color: var(--qaq-primary);
        }
        .qa-quill .ql-container {
          max-height: 200px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
          border-bottom-left-radius: var(--qaq-radius);
          border-bottom-right-radius: var(--qaq-radius);
        }

        .qa-quill .ql-toolbar {
          background: var(--qaq-toolbar-bg);
          border-top-left-radius: var(--qaq-radius);
          border-top-right-radius: var(--qaq-radius);
          border-bottom: 1px solid var(--qaq-border);
          padding: 8px 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .qa-quill .ql-toolbar .ql-formats {
          margin-right: 0;
          display: inline-flex;
          gap: 4px;
        }
        .qa-quill .ql-toolbar button,
        .qa-quill .ql-toolbar .ql-picker {
          border-radius: 6px;
          transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
        }
        .qa-quill .ql-toolbar button {
          padding: 6px;
        }
        .qa-quill .ql-toolbar button:hover,
        .qa-quill .ql-toolbar .ql-picker:hover .ql-picker-label {
          background: var(--qaq-hover);
        }
        .qa-quill .ql-toolbar button:focus-visible,
        .qa-quill .ql-toolbar .ql-picker-label:focus-visible {
          outline: 2px solid var(--qaq-primary);
          outline-offset: 2px;
        }
        .qa-quill .ql-toolbar button.ql-active,
        .qa-quill .ql-toolbar .ql-picker-label.ql-active {
          color: var(--qaq-primary);
          background: rgba(22, 119, 255, 0.12);
        }
        .qa-quill .ql-toolbar .ql-picker-label {
          padding: 6px 8px;
          border-radius: 6px;
        }
        .qa-quill .ql-toolbar .ql-picker-options {
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
          border: 1px solid var(--qaq-border) !important;
        }
        .qa-quill .ql-toolbar .ql-picker-item:hover {
          background: var(--qaq-hover);
        }

        .qa-quill .ql-container .ql-editor {
          padding: 12px 14px;
          line-height: 1.7;
          color: var(--qaq-text);
          min-height: 60px;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }
        .qa-quill .ql-editor.ql-blank::before {
          color: var(--qaq-muted);
          font-style: normal;
          opacity: 0.8;
        }

        .qa-quill .ql-container::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .qa-quill .ql-container::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 10px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .qa-quill .ql-container::-webkit-scrollbar-track {
          background: transparent;
        }

        @media (max-width: 768px) {
          .qa-quill .ql-toolbar {
            padding: 6px;
            gap: 6px;
          }
          .qa-quill .ql-toolbar button { padding: 4px; }
          .qa-quill .ql-toolbar .ql-picker-label { padding: 4px 6px; }
          .qa-quill .ql-container .ql-editor { padding: 10px 12px; }
        }
      `}</style>
      {editing ? (
        <ReactQuill
          theme="snow"
          value={value || ""}
          onChange={onChange}
          modules={modules}
          formats={formats}
          placeholder={placeholder}
          onKeyDown={stopGlobalHotkeys}
          onKeyUp={stopGlobalHotkeys}
          ref={quillRef}
          className="qa-quill"
          scrollingContainer=".qa-quill .ql-container"
        />
      ) : (
        <div
          className={`relative min-h-[60px] py-2 px-3 leading-7 text-gray-700 rounded-md ${
            editable ? "cursor-text" : ""
          }`}
          onMouseDown={() => editable && setEditing(true)}
        >
          {hasContent ? (
            <div
              ref={contentRef}
              className={`${expanded ? "" : "max-h-[160px] overflow-hidden"} ${editable ? "min-h-[60px]" : ""}`}
              tabIndex={editable ? 0 : -1}
              onClick={() => editable && setEditing(true)}
              onFocus={() => editable && setEditing(true)}
              aria-label={placeholder}
              dangerouslySetInnerHTML={{ __html: value || "" }}
            />
          ) : (
            <span
              className="text-gray-400 cursor-text"
              tabIndex={editable ? 0 : -1}
              onClick={() => editable && setEditing(true)}
              onFocus={() => editable && setEditing(true)}
              aria-label={placeholder}
            >
              {placeholder}
            </span>
          )}
          {!expanded && overflowing && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent" />
          )}
          {!expanded && overflowing && (
            <div className="mt-2">
              <Button
                type="link"
                size="small"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                展开更多
              </Button>
            </div>
          )}
          {expanded && (
            <div className="mt-2">
              <Button
                type="link"
                size="small"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
              >
                收起更多
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const StepsEditor: React.FC<{
  value?: { description?: string; result?: string }[];
  onChange?: (v: { description?: string; result?: string }[]) => void;
  onBlur?: (v: { description?: string; result?: string }[]) => void;
  editable?: boolean;
}> = ({ value, onChange, onBlur, editable = true }) => {
  const rows = Array.isArray(value) && value.length > 0 ? value : [{ description: "", result: "" }];

  useEffect(() => {
    if (!Array.isArray(value) || value.length === 0) {
      onChange?.([{ description: "", result: "" }]);
    }
  }, [value, onChange]);

  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const pointerDownInsideRef = React.useRef(false);
  React.useEffect(() => {
    const handlePointerDownCapture = () => {
      pointerDownInsideRef.current = false;
    };
    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownCapture, true);
  }, []);
  const handleWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const nextFocus = e.relatedTarget as Node | null;
    if (nextFocus && wrapperRef.current?.contains(nextFocus)) return;
    if (!nextFocus && pointerDownInsideRef.current) return;
    onBlur?.(rows);
  };

  const tableBorder = "1px solid #d9d9d9";
  const thStyle: React.CSSProperties = {
    padding: 8,
    border: tableBorder,
    textAlign: "center",
    fontWeight: 400,
    fontSize: "0.875rem",
  };
  const tdStyle: React.CSSProperties = {
    padding: 5,
    border: tableBorder,
    verticalAlign: "top",
  };

  // 拖拽排序所需的引用
  const dragItem = React.useRef<number | null>(null);
  const dragArmedRef = React.useRef(false);
  const dragImageRef = React.useRef<HTMLDivElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: "top" | "bottom" } | null>(null);

  // 新增：放大编辑状态管理
  const [expandedEdit, setExpandedEdit] = useState<{
    visible: boolean;
    rowIndex: number;
    field: "description" | "result";
    value: string;
  }>({
    visible: false,
    rowIndex: -1,
    field: "description",
    value: "",
  });

  // 新增：受控 Popover，记录当前打开的操作列索引
  const [actionPopoverOpenIndex, setActionPopoverOpenIndex] = useState<number | null>(null);

  const update = (next: { description?: string; result?: string }[]) => onChange?.(next);

  const handleAdd = () => update([...rows, { description: "", result: "" }]);

  const handleRemove = (idx: number) => {
    if (rows.length <= 1) {
      const next = [{ description: "", result: "" }];
      update(next);
      onBlur?.(next);
    } else {
      const next = rows.filter((_, i) => i !== idx);
      update(next);
      onBlur?.(next);
    }
  };

  const handleCell = (idx: number, key: "description" | "result", val: string) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [key]: val } : r));
    update(next);
  };
  // 新增：在当前行上方插入空白步骤
  const handleInsertAbove = (idx: number) => {
    const blank = { description: "", result: "" };
    const next = [...rows];
    next.splice(idx, 0, blank);
    update(next);
    // 插入后关闭 Popover，避免覆盖层影响后续点击删除
    setActionPopoverOpenIndex(null);
  };
  // 新增：在当前行下方插入空白步骤
  const handleInsertBelow = (idx: number) => {
    const blank = { description: "", result: "" };
    const next = [...rows];
    next.splice(idx + 1, 0, blank);
    update(next);
    // 插入后关闭 Popover
    setActionPopoverOpenIndex(null);
  };
  // 新增：复制当前行并插入到下一行
  const handleCopyRow = (idx: number) => {
    const current = rows[idx] ?? { description: "", result: "" };
    const copy = { description: current.description ?? "", result: current.result ?? "" };
    const next = [...rows];
    next.splice(idx + 1, 0, copy);
    update(next);
    // 复制后关闭 Popover
    setActionPopoverOpenIndex(null);
  };

  // 在目标行上触发 drop，完成数组内的重排
  const handleDropOnRow = (dropIdx: number, edge: "top" | "bottom") => {
    const dragIdx = dragItem.current;
    if (dragIdx === null) {
      dragItem.current = null;
      return;
    }
    if (dragIdx === dropIdx) {
      dragItem.current = null;
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(dragIdx, 1);

    const normalizedDropIdx = dragIdx < dropIdx ? dropIdx - 1 : dropIdx;
    let insertIndex = edge === "top" ? normalizedDropIdx : normalizedDropIdx + 1;
    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > next.length) insertIndex = next.length;

    next.splice(insertIndex, 0, moved);
    update(next);
    dragItem.current = null;
  };

  // 新增：打开放大编辑模态框
  const openExpandedEdit = (rowIndex: number, field: "description" | "result") => {
    setExpandedEdit({
      visible: true,
      rowIndex,
      field,
      value: rows[rowIndex]?.[field] || "",
    });
  };

  // 新增：保存放大编辑的内容
  const saveExpandedEdit = () => {
    if (expandedEdit.rowIndex >= 0) {
      handleCell(expandedEdit.rowIndex, expandedEdit.field, expandedEdit.value);
    }
    setExpandedEdit({
      visible: false,
      rowIndex: -1,
      field: "description",
      value: "",
    });
  };

  // 新增：取消放大编辑
  const cancelExpandedEdit = () => {
    setExpandedEdit({
      visible: false,
      rowIndex: -1,
      field: "description",
      value: "",
    });
  };

  return (
    <div
      ref={wrapperRef}
      onBlur={handleWrapperBlur}
      onPointerDownCapture={() => {
        pointerDownInsideRef.current = true;
      }}
    >
      {/* 新增：放大编辑模态框 */}
      <Modal
        open={expandedEdit.visible}
        onCancel={cancelExpandedEdit}
        title={expandedEdit.field === "description" ? "编辑步骤描述" : "编辑预期结果"}
        width="60vw"
        footer={
          editable
            ? [
                <Button key="cancel" onClick={cancelExpandedEdit}>
                  取消
                </Button>,
                <Button key="save" type="primary" onClick={saveExpandedEdit}>
                  保存
                </Button>,
              ]
            : [
                <Button key="close" onClick={cancelExpandedEdit}>
                  关闭
                </Button>,
              ]
        }
        destroyOnClose
      >
        <Input.TextArea
          readOnly={!editable}
          autoSize={{ minRows: 6, maxRows: 20 }}
          placeholder={expandedEdit.field === "description" ? "请输入步骤描述" : "请输入预期结果"}
          value={expandedEdit.value}
          onChange={(e) => setExpandedEdit((prev) => ({ ...prev, value: e.target.value }))}
          style={{ width: "100%" }}
        />
      </Modal>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: "1px solid #d9d9d9",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 72 }} />
          <col />
          <col style={{ width: "30%" }} />
          {editable && <col style={{ width: 50 }} />}
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>编号</th>
            <th style={thStyle}>步骤描述</th>
            <th style={thStyle}>预期结果</th>
            {editable && <th style={thStyle}>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              style={{
                cursor: "default",
                background: draggingIndex === idx ? "#fff" : hoveredIndex === idx ? "#f0f5ff" : undefined,
                transition: "background-color 120ms ease",
              }}
              className="transition-colors"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              onDragOver={(e) => {
                if (editable) {
                  e.preventDefault();
                  if (draggingIndex !== null && draggingIndex !== idx) {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const edge = e.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
                    setDropTarget({ index: idx, edge });
                  }
                }
              }}
              onDragLeave={() => {
                if (editable && dropTarget?.index === idx) {
                  setDropTarget(null);
                }
              }}
              draggable={editable}
              onDragStart={(e) => {
                if (!editable) return;
                if (!dragArmedRef.current) {
                  e.preventDefault();
                  return;
                }
                dragItem.current = idx;
                setDraggingIndex(idx);
                dragArmedRef.current = false;
                e.dataTransfer.effectAllowed = "move";
                const dragEl = document.createElement("div");
                dragEl.style.position = "fixed";
                dragEl.style.top = "0";
                dragEl.style.left = "0";
                // 记录鼠标相对于行左上角的偏移，使拖拽时行位置与鼠标保持相对静止
                const startRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const offsetX = e.clientX - startRect.left;
                const offsetY = e.clientY - startRect.top;
                dragEl.dataset.offsetX = String(offsetX);
                dragEl.dataset.offsetY = String(offsetY);
                dragEl.style.transform = `translate3d(${e.clientX - offsetX}px, ${e.clientY - offsetY}px, 0)`;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const width = rect.width;
                dragEl.style.width = `${width}px`;
                dragEl.style.display = "grid";
                // 动态计算列宽比例
                const col1 = (e.currentTarget as HTMLElement).children[0]?.getBoundingClientRect().width || 72;
                const col2 = (e.currentTarget as HTMLElement).children[1]?.getBoundingClientRect().width || 0;
                const col3 = (e.currentTarget as HTMLElement).children[2]?.getBoundingClientRect().width || 0;
                const col4 = (e.currentTarget as HTMLElement).children[3]?.getBoundingClientRect().width || 50;
                dragEl.style.gridTemplateColumns = `${col1}px ${col2}px ${col3}px ${col4}px`;
                dragEl.style.alignItems = "stretch";
                dragEl.style.background = "#fff";
                dragEl.style.boxShadow = "0 6px 16px -8px rgba(0,0,0,0.08), 0 9px 28px 0 rgba(0,0,0,0.05), 0 12px 48px 16px rgba(0,0,0,0.03)";
                dragEl.style.border = "1px solid #d9d9d9";
                dragEl.style.borderRadius = "6px";
                dragEl.style.overflow = "hidden";
                dragEl.style.pointerEvents = "none";
                dragEl.style.fontSize = "14px";
                dragEl.style.color = "rgba(0,0,0,0.88)";
                dragEl.style.zIndex = "9999";
                const mkCell = (text: string, align: "left" | "center" = "left") => {
                  const cell = document.createElement("div");
                  cell.style.padding = "8px";
                  cell.style.borderRight = "1px solid #d9d9d9";
                  cell.style.whiteSpace = "pre-wrap";
                  cell.style.wordBreak = "break-word";
                  cell.style.textAlign = align;
                  cell.textContent = text;
                  return cell;
                };
                dragEl.appendChild(mkCell(String(idx + 1), "center"));
                dragEl.appendChild(mkCell(String(row?.description ?? "")));
                dragEl.appendChild(mkCell(String(row?.result ?? "")));
                const opCell = mkCell("", "center");
                opCell.style.borderRight = "none";
                dragEl.appendChild(opCell);
                document.body.appendChild(dragEl);
                dragImageRef.current = dragEl;
                const transparentPixel = new Image();
                transparentPixel.src =
                  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
                e.dataTransfer.setDragImage(transparentPixel, 0, 0);
                try {
                  e.dataTransfer.setData("text/plain", String(idx));
                } catch {}
              }}
              onDrag={(e) => {
                if (!editable) return;
                if (!dragImageRef.current) return;
                if (!e.clientX && !e.clientY) return;
                const offsetX = Number(dragImageRef.current.dataset.offsetX || 0);
                const offsetY = Number(dragImageRef.current.dataset.offsetY || 0);
                dragImageRef.current.style.transform = `translate3d(${e.clientX - offsetX}px, ${e.clientY - offsetY}px, 0)`;
              }}
              onDragEnd={() => {
                if (!editable) return;
                setDraggingIndex(null);
                setDropTarget(null);
                dragArmedRef.current = false;
                dragItem.current = null;
                if (dragImageRef.current) {
                  dragImageRef.current.remove();
                  dragImageRef.current = null;
                }
              }}
              onDrop={() => {
                if (editable) {
                  const edge = dropTarget?.index === idx ? dropTarget.edge : "bottom";
                  handleDropOnRow(idx, edge);
                  setDraggingIndex(null);
                  setDropTarget(null);
                  dragArmedRef.current = false;
                  if (dragImageRef.current) {
                    dragImageRef.current.remove();
                    dragImageRef.current = null;
                  }
                }
              }}
            >
              <td
                style={{
                  ...tdStyle,
                  textAlign: "center",
                  cursor: editable ? (draggingIndex === idx ? "grabbing" : "grab") : "default",
                  boxShadow:
                    dropTarget?.index === idx
                      ? dropTarget.edge === "top"
                        ? "inset 0 1px 0 #3e79f7"
                        : "inset 0 -1px 0 #3e79f7"
                      : undefined,
                }}
                onMouseDown={() => {
                  if (!editable) return;
                  dragArmedRef.current = true;
                }}
                onMouseUp={() => {
                  if (!editable) return;
                  dragArmedRef.current = false;
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    cursor: draggingIndex === idx ? "grabbing" : "grab",
                    WebkitUserSelect: "none",
                    userSelect: "none",
                    width: "100%",
                    height: "100%",
                    justifyContent: "center",
                  }}
                >
                  {idx + 1}
                </span>
              </td>
              <td
                style={{
                  ...tdStyle,
                  boxShadow:
                    dropTarget?.index === idx
                      ? dropTarget.edge === "top"
                        ? "inset 0 1px 0 #3e79f7"
                        : "inset 0 -1px 0 #3e79f7"
                      : undefined,
                }}
              >
                <div className="group" style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <Input.TextArea
                    readOnly={!editable}
                    bordered={false}
                    autoSize={{ minRows: 1, maxRows: 8 }}
                    placeholder="请输入步骤描述"
                    value={row?.description ?? ""}
                    onChange={(e) => handleCell(idx, "description", e.target.value)}
                    style={{
                      padding: 0,
                      background: "transparent",
                      lineHeight: "20px",
                      flex: 1,
                    }}
                  />
                  {/* 新增：放大图标按钮（仅在悬停输入区域时显示，纯 CSS） */}
                  <Button
                    type="text"
                    size="small"
                    icon={<ExpandAltOutlined />}
                    onClick={() => openExpandedEdit(idx, "description")}
                    title="放大编辑"
                    className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                  />
                </div>
              </td>
              <td
                style={{
                  ...tdStyle,
                  boxShadow:
                    dropTarget?.index === idx
                      ? dropTarget.edge === "top"
                        ? "inset 0 1px 0 #3e79f7"
                        : "inset 0 -1px 0 #3e79f7"
                      : undefined,
                }}
              >
                <div className="group" style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <Input.TextArea
                    readOnly={!editable}
                    bordered={false}
                    autoSize={{ minRows: 1, maxRows: 8 }}
                    placeholder="请输入预期结果"
                    value={row?.result ?? ""}
                    onChange={(e) => handleCell(idx, "result", e.target.value)}
                    style={{
                      padding: 0,
                      background: "transparent",
                      lineHeight: "20px",
                      flex: 1,
                    }}
                  />
                  {/* 新增：放大图标按钮（仅在悬停输入区域时显示，纯 CSS） */}
                  <Button
                    type="text"
                    size="small"
                    icon={<ExpandAltOutlined />}
                    onClick={() => openExpandedEdit(idx, "result")}
                    title="放大编辑"
                    className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                  />
                </div>
              </td>
              {editable && (
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    boxShadow:
                      dropTarget?.index === idx
                        ? dropTarget.edge === "top"
                          ? "inset 0 1px 0 #3e79f7"
                          : "inset 0 -1px 0 #3e79f7"
                        : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                    }}
                  >
                    <Popover
                      trigger="click"
                      placement="rightTop"
                      overlayStyle={{ padding: 0 }}
                      content={
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            textAlign: "left",
                            alignItems: "flex-start",
                          }}
                        >
                          <Button
                            data-button-area="true"
                            size="small"
                            type="text"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleInsertAbove(idx)}
                            style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 6 }}
                          >
                            <ArrowUpOutlined />
                            向上添加步骤
                          </Button>
                          <Button
                            data-button-area="true"
                            size="small"
                            type="text"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleInsertBelow(idx)}
                            style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 6 }}
                          >
                            <ArrowDownOutlined />
                            向下添加步骤
                          </Button>
                          <Button
                            data-button-area="true"
                            size="small"
                            type="text"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleCopyRow(idx)}
                            style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 6 }}
                          >
                            <CopyOutlined />
                            复制
                          </Button>
                          <Button
                            data-button-area="true"
                            size="small"
                            type="text"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleRemove(idx)}
                            style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 6 }}
                          >
                            <DeleteOutlined />
                            删除
                          </Button>
                        </div>
                      }
                    >
                      <Button type="text" size="small" icon={<EllipsisOutlined />} title="更多操作" />
                    </Popover>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {editable && (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-start" }}>
          <Button
            color="primary"
            variant="text"
            icon={<PlusOutlined />}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAdd}
          >
            新增步骤
          </Button>
        </div>
      )}
    </div>
  );
};

export const formatCNDateTime = (v?: string | number | Date): string => {
  if (!v) return "-";
  const d = typeof v === "string" || typeof v === "number" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
};
