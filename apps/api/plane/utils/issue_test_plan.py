"""缺陷 ↔ 来源测试计划（Issue.test_plan）挂靠的领域规则。

只有一条：计划必须属于工作项所在项目且未删除。工作项创建 / PATCH（app 与公开 API
两套序列化器）共用，不要在视图里另写。
"""

from rest_framework import serializers

ERROR_TEST_PLAN_NOT_IN_PROJECT = "TEST_PLAN_NOT_IN_PROJECT"


def validate_test_plan_in_project(test_plan, project_id, *, field="test_plan_id"):
    """`test_plan` 是模型实例或 None；None（清空 / 未填）直接放行。"""
    if test_plan is None:
        return
    if test_plan.deleted_at is not None or str(test_plan.project_id) != str(project_id):
        raise serializers.ValidationError({field: [ERROR_TEST_PLAN_NOT_IN_PROJECT]})
