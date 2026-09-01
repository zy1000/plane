/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
// constants
import { ACCEPTED_ATTACHMENT_MIME_TYPES, ACCEPTED_IMAGE_MIME_TYPES } from "@/constants/config";
// types
import type { TEditorCommands, TExtensions } from "@/types";

type Props = {
  disabledExtensions?: TExtensions[];
  flaggedExtensions?: TExtensions[];
  editor: Editor;
};

/** 浏览器里「复制图片」得到的 HTML 只会有这些标签；出现别的元素或文本，说明剪贴板主体是文档内容 */
const IMAGE_ONLY_TAGS = new Set(["IMG", "META", "BR"]);

const hasNonImageContent = (html: string): boolean => {
  if (!html) return false;
  const { body } = new DOMParser().parseFromString(html, "text/html");
  if (body.textContent?.trim()) return true;
  return Array.from(body.querySelectorAll("*")).some((element) => !IMAGE_ONLY_TAGS.has(element.tagName));
};

export const DropHandlerPlugin = (props: Props): Plugin => {
  const { disabledExtensions, flaggedExtensions, editor } = props;

  return new Plugin({
    key: new PluginKey("drop-handler-plugin"),
    props: {
      handlePaste: (view, event) => {
        if (
          editor.isEditable &&
          event.clipboardData &&
          event.clipboardData.files &&
          event.clipboardData.files.length > 0
        ) {
          // Excel / Word 复制表格时，剪贴板里除了 HTML 还带一张位图快照（Chrome 暴露为 image.png）。
          // 只要 HTML 里有位图以外的内容就交给 ProseMirror 默认解析，否则表格会被当成截图上传；
          // 「复制图片」得到的 HTML 只有一个 <img>，仍走文件上传。
          if (hasNonImageContent(event.clipboardData.getData("text/html"))) return false;
          event.preventDefault();
          const files = Array.from(event.clipboardData.files);
          const acceptedFiles = files.filter(
            (f) => ACCEPTED_IMAGE_MIME_TYPES.includes(f.type) || ACCEPTED_ATTACHMENT_MIME_TYPES.includes(f.type)
          );

          if (acceptedFiles.length) {
            const pos = view.state.selection.from;
            insertFilesSafely({
              disabledExtensions,
              flaggedExtensions,
              editor,
              files: acceptedFiles,
              initialPos: pos,
              event: "drop",
            });
          }
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (
          editor.isEditable &&
          !moved &&
          event.dataTransfer &&
          event.dataTransfer.files &&
          event.dataTransfer.files.length > 0
        ) {
          event.preventDefault();
          const files = Array.from(event.dataTransfer.files);
          const acceptedFiles = files.filter(
            (f) => ACCEPTED_IMAGE_MIME_TYPES.includes(f.type) || ACCEPTED_ATTACHMENT_MIME_TYPES.includes(f.type)
          );

          if (acceptedFiles.length) {
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            if (coordinates) {
              const pos = coordinates.pos;
              insertFilesSafely({
                disabledExtensions,
                editor,
                files: acceptedFiles,
                initialPos: pos,
                event: "drop",
              });
            }
            return true;
          }
        }
        return false;
      },
    },
  });
};

type InsertFilesSafelyArgs = {
  disabledExtensions?: TExtensions[];
  flaggedExtensions?: TExtensions[];
  editor: Editor;
  event: "insert" | "drop";
  files: File[];
  initialPos: number;
  type?: Extract<TEditorCommands, "attachment" | "image">;
};

export const insertFilesSafely = async (args: InsertFilesSafelyArgs) => {
  const { disabledExtensions, editor, event, files, initialPos, type } = args;
  let pos = initialPos;

  for (const file of files) {
    // safe insertion
    const docSize = editor.state.doc.content.size;
    pos = Math.min(pos, docSize);

    let fileType: "image" | "attachment" | null = null;

    try {
      if (type) {
        if (["image", "attachment"].includes(type)) fileType = type;
        else throw new Error("Wrong file type passed");
      } else {
        if (ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) fileType = "image";
        else if (ACCEPTED_ATTACHMENT_MIME_TYPES.includes(file.type)) fileType = "attachment";
      }
      // insert file depending on the type at the current position
      if (fileType === "image" && !disabledExtensions?.includes("image")) {
        editor.commands.insertImageComponent({
          file,
          pos,
          event,
        });
      } else if (fileType === "attachment") {
      }
    } catch (error) {
      console.error(`Error while ${event}ing file:`, error);
    }

    // Move to the next position
    pos += 1;
  }
};
