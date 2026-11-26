/**
 * 文件预览弹窗的宿主：整个工作区布局里只挂一个，谁想在当前页面预览文件模块里的文件，
 * 调 openFilestorePreview 就行（见 filestore-preview-link.ts）。
 *
 * 弹窗不跟着触发它的那个控件渲染 —— 链接常常长在「点了就打开下拉 / 进入编辑」的格子里，
 * 弹窗挂在那儿的话，里面的每次点击都会沿 React 树冒回格子上。
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { Modal } from "antd";
import { subscribeFilestorePreview } from "./filestore-preview-link";
import type { TFilestorePreviewTarget } from "./filestore-preview-link";

// 预览本体带着 OnlyOffice / xmind 两套东西，用到才加载
const FilestoreFilePreview = lazy(() =>
  import("./filestore-file-preview").then((module) => ({ default: module.FilestoreFilePreview }))
);

export const FilestorePreviewHost = () => {
  const [target, setTarget] = useState<TFilestorePreviewTarget | null>(null);

  useEffect(() => subscribeFilestorePreview(setTarget), []);

  const close = () => setTarget(null);

  return (
    <Modal
      open={Boolean(target)}
      onCancel={close}
      footer={null}
      title={null}
      // 关闭按钮在预览自己的顶栏里，和下载并排
      closable={false}
      modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
      width="100vw"
      style={{ top: 0, paddingBottom: 0 }}
      styles={{ content: { padding: 0, overflow: "hidden" }, body: { padding: 0 } }}
      destroyOnHidden
    >
      <div style={{ height: "100vh" }}>
        {target && (
          <Suspense fallback={null}>
            <FilestoreFilePreview {...target} onClose={close} />
          </Suspense>
        )}
      </div>
    </Modal>
  );
};
