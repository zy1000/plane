from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.qa.case import CaseVersionListSerializer, CaseVersionCompareSerializer
from plane.app.views import BaseAPIView
from plane.db.models import TestCaseVersion


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
            from_version_int = int(from_version)
            to_version_int = int(to_version)
        except ValueError:
            return Response(
                {"error": "from_version and to_version must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        snapshots = (
            self.queryset.filter(case_id=case_id, version__in=[from_version_int, to_version_int])
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
        )
        snapshot_map = {s.version: s for s in snapshots}
        from_snapshot = snapshot_map.get(from_version_int)
        to_snapshot = snapshot_map.get(to_version_int)

        if not from_snapshot or not to_snapshot:
            return Response(
                {"error": "snapshot not found for one or both versions"},
                status=status.HTTP_404_NOT_FOUND,
            )
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


