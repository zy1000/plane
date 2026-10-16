from django.urls import path

from plane.app.views.department import DepartmentPeopleAPIView, DepartmentTreeAPIView

urlpatterns = [
    path("workspaces/<str:slug>/departments/", DepartmentTreeAPIView.as_view(), name="departments"),
    path("workspaces/<str:slug>/departments/people/", DepartmentPeopleAPIView.as_view(), name="department-people"),
]
