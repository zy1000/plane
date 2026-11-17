# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from collections import defaultdict

# Module imports
from .base import BaseSerializer
from rest_framework import serializers

from plane.db.models import State, StateGroup, IssueType
from plane.utils.issue_scheme import project_scheme_id


class StateSerializer(BaseSerializer):
    order = serializers.FloatField(required=False)
    # 状态归方案。project_id 取方案的归属项目（模式方案为空），前端按 scheme_id 归属状态
    project_id = serializers.UUIDField(source="scheme.project_id", read_only=True)
    scheme_id = serializers.UUIDField(read_only=True)
    issue_type_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueType.objects.all(),
        source="issue_type",
        required=False,
        allow_null=False,
    )

    class Meta:
        model = State
        fields = [
            "id",
            "project_id",
            "scheme_id",
            "workspace_id",
            "name",
            "color",
            "group",
            "default",
            "description",
            "sequence",
            "order",
            'issue_type_id',
        ]
        read_only_fields = ["workspace"]

    def validate(self, attrs):
        if attrs.get("group") == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        # 类型必须在当前方案里（方案级路由直接给 scheme_id，项目级路由按项目所用的方案）
        scheme_id = self.context.get("scheme_id") or project_scheme_id(self.context.get("project_id"))
        if attrs.get("issue_type") and str(attrs["issue_type"].scheme_id) != str(scheme_id):
            raise serializers.ValidationError("Issue type is not valid please pass a valid issue_type_id")
        return attrs


#: 工作区全量状态的线上格式里每个字段落在哪：行自己带的、还是去重后放进公共表的。
#: StateSerializer 加字段时这里和 ``build_workspace_states_payload`` 要跟着加，下面的自检会拦住漏改
_WORKSPACE_STATES_FIELDS = {
    "id", "default", "sequence", "order",  # 行
    "scheme_id", "project_id",  # schemes
    "issue_type_id",  # issue_types
    "name", "color", "group", "description",  # definitions
    "workspace_id",  # 顶层
}  # fmt: skip
if _WORKSPACE_STATES_FIELDS != set(StateSerializer.Meta.fields):
    raise RuntimeError("工作区全量状态的字段与 StateSerializer.Meta.fields 不一致，请同步 build_workspace_states_payload")


def build_workspace_states_payload(rows):
    """工作区全量状态的线上格式（前端在服务层还原成与 StateSerializer 同形状的对象）。

    工作区下有几万个状态（每个项目方案 × 每个类型各一套），但名称 / 颜色 / 分组只有几十种组合、
    方案和类型也各自重复几十次。逐行输出完整对象是 10 MB；这里把重复的值各输出一次，行里只放下标::

        {
          "workspace_id": ...,
          "schemes": [[scheme_id, project_id], ...],
          "issue_types": [issue_type_id, ...],
          "definitions": [[name, color, group, description], ...],
          "states": [[id, 方案下标, 类型下标或 null, 定义下标, default, sequence, order], ...],
        }

    ``rows`` 是按输出顺序排好的元组：(id, scheme_id, project_id, workspace_id, issue_type_id,
    name, color, group, default, description, sequence)，id 都已是字符串。
    ``order`` 是状态在同分组里的相对位置（第几个 / 该分组总数），依赖 ``rows`` 的顺序。
    """
    rows = list(rows)
    group_totals = defaultdict(int)
    for row in rows:
        group_totals[row[7]] += 1
    group_seen = defaultdict(int)
    schemes, scheme_index = [], {}
    issue_types, issue_type_index = [], {}
    definitions, definition_index = [], {}
    states = []
    for (
        state_id, scheme_id, project_id, _workspace_id, issue_type_id,
        name, color, group, default, description, sequence,
    ) in rows:  # fmt: skip
        scheme = scheme_index.get(scheme_id)
        if scheme is None:
            scheme = scheme_index[scheme_id] = len(schemes)
            schemes.append([scheme_id, project_id])
        issue_type = None
        if issue_type_id is not None:
            issue_type = issue_type_index.get(issue_type_id)
            if issue_type is None:
                issue_type = issue_type_index[issue_type_id] = len(issue_types)
                issue_types.append(issue_type_id)
        definition_key = (name, color, group, description)
        definition = definition_index.get(definition_key)
        if definition is None:
            definition = definition_index[definition_key] = len(definitions)
            definitions.append([name, color, group, description])
        group_seen[group] += 1
        states.append(
            [state_id, scheme, issue_type, definition, default, sequence, group_seen[group] / group_totals[group]]
        )
    return {
        "workspace_id": rows[0][3] if rows else None,
        "schemes": schemes,
        "issue_types": issue_types,
        "definitions": definitions,
        "states": states,
    }


class StateLiteSerializer(BaseSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
