"""工作项 / 迭代 ↔ 项目阶段（ProjectStage）挂靠的领域规则。

`Issue.stage` 与 `Cycle.stage` 是两个互不派生、互不限制的单选外键：工作项在某个
迭代里也可以填和迭代不同的阶段，父阶段、子阶段都可以挂。规则只有一条 —— 阶段必须
属于同一个项目 —— 写在这里，工作项（创建 / PATCH / 批量）和迭代的序列化器共用，
不要在视图里另写。
"""

from rest_framework import serializers

ERROR_STAGE_NOT_IN_PROJECT = "STAGE_NOT_IN_PROJECT"


def validate_stage_in_project(stage, project_id, *, field="stage_id"):
    """`stage` 是模型实例或 None；None（清空 / 未填）直接放行。"""
    if stage is None:
        return
    if str(stage.project_id) != str(project_id):
        raise serializers.ValidationError({field: [ERROR_STAGE_NOT_IN_PROJECT]})
