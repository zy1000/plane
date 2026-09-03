# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re
from io import StringIO
from html.parser import HTMLParser


class MLStripper(HTMLParser):
    """
    Markup Language Stripper
    """

    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.text = StringIO()

    def handle_data(self, d):
        self.text.write(d)

    def get_data(self):
        return self.text.getvalue()


def strip_tags(html):
    s = MLStripper()
    s.feed(html)
    return s.get_data()


_BLOCK_END_RE = re.compile(
    r"</(?:p|div|li|ul|ol|h[1-6]|tr|table|blockquote|pre|section|article)>|<br\s*/?>",
    re.IGNORECASE,
)
_CELL_END_RE = re.compile(r"</(?:td|th)>", re.IGNORECASE)


def strip_tags_preserving_blocks(html):
    """把 HTML 压成人能读的纯文本，保留块级边界。

    strip_tags() 在标签之间不吐任何分隔符，`<td>a</td><td>b</td>` 会粘成 "ab"，
    表格和段落的结构在入库时就没了。需要拿纯文本做展示或比对时用这个：
    块级结束标签 → 换行，单元格结束 → " | "。
    """
    if not html:
        return ""
    text = _CELL_END_RE.sub(" | ", str(html))
    text = _BLOCK_END_RE.sub("\n", text)
    lines = []
    for line in text.split("\n"):
        line = strip_tags(line).replace("\xa0", " ").strip()
        # 整行只剩单元格分隔符时（空表格行）丢弃
        line = line.strip("|").strip()
        if line:
            lines.append(line)
    return "\n".join(lines)

