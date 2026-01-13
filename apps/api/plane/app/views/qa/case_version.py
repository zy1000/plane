from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.qa.case import CaseVersionListSerializer, CaseVersionCompareSerializer
from plane.app.views import BaseAPIView
from plane.db.models import TestCase, TestCaseVersion


class CaseVersionAPIView(BaseAPIView):
    model = TestCaseVersion
    queryset = TestCaseVersion.objects.all()
    serializer_class = CaseVersionListSerializer

    def get(self, request, slug):
        case_id = request.query_params.get("case_id")
        if not case_id:
            return Response({"error": "case_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        case_versions = self.queryset.filter(case_id=case_id)
        serializer = self.serializer_class(case_versions, many=True)
        return Response(data=serializer.data, status=status.HTTP_200_OK)


class CaseVersionCompareAPIView(BaseAPIView):
    model = TestCaseVersion
    queryset = TestCaseVersion.objects.all()

    def get(self, request, slug):
        case_id = request.query_params.get("case_id")
        if not case_id:
            return Response({"error": "case_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        from_version = request.query_params.get("from_version")
        to_version = request.query_params.get("to_version")
        if from_version is None or to_version is None:
            return Response(
                {"error": "from_version and to_version are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from_version_int = -1 if str(from_version).lower() == "current" else int(from_version)
            to_version_int = -1 if str(to_version).lower() == "current" else int(to_version)
        except ValueError:
            return Response(
                {"error": "from_version and to_version must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def _build_current_snapshot() -> TestCaseVersion | None:
            try:
                case = TestCase.objects.get(id=case_id)
            except TestCase.DoesNotExist:
                return None

            label_ids = list(map(str, case.labels.values_list("id", flat=True)))
            issue_ids = list(map(str, case.issues.values_list("id", flat=True)))

            return TestCaseVersion(
                id=case.id,
                case=case,
                version=-1,
                repository_id=str(case.repository_id),
                module_id=str(case.module_id) if case.module_id else None,
                assignee_id=str(case.assignee_id) if case.assignee_id else None,
                code=case.code or "",
                name=case.name,
                precondition=case.precondition,
                steps=case.steps,
                remark=case.remark,
                type=case.type,
                test_type=case.test_type,
                priority=case.priority,
                state=getattr(case, "state", TestCase.State.PENDING_REVIEW),
                label_ids=label_ids,
                issue_ids=issue_ids,
                created_at=case.updated_at,
            )

        required_versions = [v for v in [from_version_int, to_version_int] if v >= 0]
        snapshots = (
            self.queryset.filter(case_id=case_id, version__in=required_versions)
            .only(
                "id",
                "case_id",
                "version",
                "repository_id",
                "module_id",
                "assignee_id",
                "code",
                "name",
                "precondition",
                "steps",
                "remark",
                "type",
                "test_type",
                "priority",
                "state",
                "label_ids",
                "issue_ids",
                "created_at",
            )
            if required_versions
            else []
        )
        snapshot_map = {s.version: s for s in snapshots} if required_versions else {}

        current_snapshot = _build_current_snapshot() if (from_version_int == -1 or to_version_int == -1) else None
        if (from_version_int == -1 or to_version_int == -1) and current_snapshot is None:
            return Response({"error": "case not found"}, status=status.HTTP_404_NOT_FOUND)

        from_snapshot = current_snapshot if from_version_int == -1 else snapshot_map.get(from_version_int)
        to_snapshot = current_snapshot if to_version_int == -1 else snapshot_map.get(to_version_int)

        if not from_snapshot or not to_snapshot:
            return Response({"error": "snapshot not found for one or both versions"}, status=status.HTTP_404_NOT_FOUND)
        serializer = CaseVersionCompareSerializer(
            {
                'case_id': str(case_id),
                'from_version': from_version_int,
                'to_version': to_version_int,
                'from_snapshot': from_snapshot,
                'to_snapshot': to_snapshot,
            }
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


