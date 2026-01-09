from rest_framework import serializers
from rest_framework.serializers import ModelSerializer

from plane.db.models import PlanCaseRecord, CaseLabel, TestCaseVersion


class CaseExecuteRecordSerializer(ModelSerializer):
    name = serializers.SerializerMethodField()

    def get_name(self, obj: PlanCaseRecord):
        return obj.plan_case.plan.name

    class Meta:
        model = PlanCaseRecord
        fields = '__all__'


class CaseLabelListSerializer(ModelSerializer):
    class Meta:
        model = CaseLabel
        fields = '__all__'


class CaseVersionListSerializer(ModelSerializer):
    class Meta:
        model = TestCaseVersion
        fields = ['id', 'version', 'created_at']


class CaseVersionSnapshotSerializer(ModelSerializer):
    class Meta:
        model = TestCaseVersion
        fields = ['id', 'version', 'created_at']


class CaseVersionCompareSerializer(serializers.Serializer):
    case_id = serializers.CharField()
    from_version = serializers.IntegerField()
    to_version = serializers.IntegerField()
    from_snapshot = CaseVersionSnapshotSerializer()
    to_snapshot = CaseVersionSnapshotSerializer()
    changed_fields = serializers.SerializerMethodField()
    changed_count = serializers.SerializerMethodField()

    def _get_changed_fields_cached(self, obj):
        from_snapshot: TestCaseVersion = obj.get('from_snapshot')
        to_snapshot: TestCaseVersion = obj.get('to_snapshot')
        key = (str(getattr(from_snapshot, 'id', '')), str(getattr(to_snapshot, 'id', '')))
        cache = getattr(self, '_changed_fields_cache', None)
        if cache is None:
            cache = {}
            setattr(self, '_changed_fields_cache', cache)
        if key in cache:
            return cache[key]

        def _as_list(value):
            if value is None:
                return []
            if isinstance(value, list):
                return [str(v) for v in value]
            return [str(value)]

        def _field_change(field, label, change_type, old, new, extra=None):
            payload = {
                'field': field,
                'label': label,
                'change_type': change_type,
                'from': old,
                'to': new,
            }
            if extra:
                payload.update(extra)
            return payload

        field_labels = {
            'repository_id': '测试库',
            'module_id': '模块',
            'assignee_id': '维护人',
            'code': '编号',
            'name': '名称',
            'precondition': '前置条件',
            'steps': '步骤',
            'remark': '备注',
            'type': '类型',
            'test_type': '测试类型',
            'priority': '优先级',
            'state': '状态',
            'label_ids': '标签',
            'issue_ids': '关联工作项',
        }

        comparable_fields = [
            'repository_id',
            'module_id',
            'assignee_id',
            'code',
            'name',
            'precondition',
            'steps',
            'remark',
            'type',
            'test_type',
            'priority',
            'state',
            'label_ids',
            'issue_ids',
        ]

        from_label_ids = _as_list(getattr(from_snapshot, 'label_ids', None))
        to_label_ids = _as_list(getattr(to_snapshot, 'label_ids', None))
        all_label_ids = set(from_label_ids) | set(to_label_ids)
        label_name_by_id = {}
        if all_label_ids:
            qs = CaseLabel.objects.filter(id__in=list(all_label_ids)).values('id', 'name')
            label_name_by_id = {str(r['id']): r['name'] for r in qs}

        def _labels_display(ids):
            id_list = [str(i) for i in (ids or [])]
            if not id_list:
                return []
            return [{'id': i, 'name': label_name_by_id.get(i) or i} for i in id_list]

        from_issue_ids = _as_list(getattr(from_snapshot, 'issue_ids', None))
        to_issue_ids = _as_list(getattr(to_snapshot, 'issue_ids', None))
        all_issue_ids = set(from_issue_ids) | set(to_issue_ids)
        issue_by_id = {}
        if all_issue_ids:
            from plane.db.models import Issue

            qs = Issue.objects.filter(id__in=list(all_issue_ids)).values(
                'id',
                'name',
                'sequence_id',
                'type__name',
                'project_id',
                'archived_at',
            )
            issue_by_id = {str(r['id']): r for r in qs}

        def _issues_display(ids):
            id_list = [str(i) for i in (ids or [])]
            if not id_list:
                return []
            result = []
            for i in id_list:
                row = issue_by_id.get(i) or {}
                type_name = row.get('type__name')
                group = (
                    '产品需求'
                    if type_name in ['史诗', '特性', '用户故事']
                    else '缺陷'
                    if type_name == '缺陷'
                    else '工作项'
                    if type_name == '任务'
                    else '工作项'
                )
                result.append(
                    {
                        'id': i,
                        'name': row.get('name') or i,
                        'sequence_id': row.get('sequence_id'),
                        'type_name': type_name,
                        'group': group,
                        'project_id': str(row.get('project_id')) if row.get('project_id') else None,
                        'is_archived': bool(row.get('archived_at')),
                    }
                )
            return result

        def _group_issues_display(items):
            grouped = {'产品需求': [], '工作项': [], '缺陷': []}
            for it in items or []:
                g = it.get('group') if isinstance(it, dict) else None
                if g in grouped:
                    grouped[g].append(it)
                else:
                    grouped['工作项'].append(it)
            return grouped

        changed = []
        for f in comparable_fields:
            old = getattr(from_snapshot, f)
            new = getattr(to_snapshot, f)

            if f in ['label_ids', 'issue_ids']:
                old_list = _as_list(old)
                new_list = _as_list(new)
                old_set = set(old_list)
                new_set = set(new_list)
                if old_set != new_set:
                    added = sorted(list(new_set - old_set))
                    removed = sorted(list(old_set - new_set))
                    display_fn = _labels_display if f == 'label_ids' else _issues_display
                    changed.append(
                        _field_change(
                            f,
                            field_labels.get(f, f),
                            'modified',
                            old_list,
                            new_list,
                            {
                                'added': added,
                                'removed': removed,
                                'from_display': display_fn(old_list),
                                'to_display': display_fn(new_list),
                                'added_display': display_fn(added),
                                'removed_display': display_fn(removed),
                                'from_display_grouped': _group_issues_display(display_fn(old_list))
                                if f == 'issue_ids'
                                else None,
                                'to_display_grouped': _group_issues_display(display_fn(new_list))
                                if f == 'issue_ids'
                                else None,
                                'added_display_grouped': _group_issues_display(display_fn(added))
                                if f == 'issue_ids'
                                else None,
                                'removed_display_grouped': _group_issues_display(display_fn(removed))
                                if f == 'issue_ids'
                                else None,
                            },
                        )
                    )
            else:
                if old != new:
                    changed.append(
                        _field_change(
                            f,
                            field_labels.get(f, f),
                            'modified',
                            old,
                            new,
                        )
                    )

        cache[key] = changed
        return changed

    def get_changed_fields(self, obj):
        return self._get_changed_fields_cached(obj)

    def get_changed_count(self, obj):
        return len(self._get_changed_fields_cached(obj))
