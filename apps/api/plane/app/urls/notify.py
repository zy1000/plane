from django.urls import path

from plane.app.views.notify import (
    MyNotifySubscriptionDetailEndpoint,
    MyNotifySubscriptionEndpoint,
    NotifyMailEndpoint,
    NotifyMailResendEndpoint,
    NotifyRuleDetailEndpoint,
    NotifyRuleEndpoint,
    NotifyScopeEndpoint,
    NotifySubscriberDetailEndpoint,
    NotifySubscriberEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/notify/subscribers/",
        NotifySubscriberEndpoint.as_view(),
        name="notify-subscribers",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/notify/subscribers/<uuid:pk>/",
        NotifySubscriberDetailEndpoint.as_view(),
        name="notify-subscriber-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/notify/scope/",
        NotifyScopeEndpoint.as_view(),
        name="notify-scope",
    ),
    path(
        "workspaces/<str:slug>/notify/my-subscriptions/",
        MyNotifySubscriptionEndpoint.as_view(),
        name="notify-my-subscriptions",
    ),
    path(
        "workspaces/<str:slug>/notify/my-subscriptions/<str:kind>/<uuid:pk>/",
        MyNotifySubscriptionDetailEndpoint.as_view(),
        name="notify-my-subscription-detail",
    ),
    path("workspaces/<str:slug>/notify/rules/", NotifyRuleEndpoint.as_view(), name="notify-rules"),
    path(
        "workspaces/<str:slug>/notify/rules/<str:event>/",
        NotifyRuleDetailEndpoint.as_view(),
        name="notify-rule-detail",
    ),
    path("workspaces/<str:slug>/notify/mails/", NotifyMailEndpoint.as_view(), name="notify-mails"),
    path(
        "workspaces/<str:slug>/notify/mails/<uuid:pk>/resend/",
        NotifyMailResendEndpoint.as_view(),
        name="notify-mail-resend",
    ),
]
