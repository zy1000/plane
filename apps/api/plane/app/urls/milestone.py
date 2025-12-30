from django.urls import path, include
from rest_framework.routers import SimpleRouter

from plane.app.views.milestone.base import MilestoneAPIView, MilestoneView

router = SimpleRouter()
router.register('milestone', MilestoneView, basename='milestone')
urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestone/",
        MilestoneAPIView.as_view(),
        name='milestone'
    ),
    path('workspaces/<str:slug>/projects/<uuid:project_id>/', include(router.urls)),

]
