from plane.app.views import BaseViewSet
from plane.db.models import TimeSheet


class TimeSheetExportViewSet(BaseViewSet):
    model = TimeSheet

    def export(self, request, slug):
        all_workspace = request.data.get('all_workspace')
        query = TimeSheet.objects.all()
        if all_workspace:
            query = query.filter(workspace__slug=slug)
