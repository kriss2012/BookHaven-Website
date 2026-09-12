from django.urls import path
from . import views

urlpatterns = [
    path('', views.ReviewListView.as_view(), name='review-list'),
    path('create/', views.ReviewCreateView.as_view(), name='review-create'),
    path('<int:review_id>/', views.ReviewDeleteView.as_view(), name='review-delete'),
]
