from rest_framework import serializers
from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_avatar = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ('id', 'book', 'user_name', 'user_avatar', 'rating', 'text', 'created_at')
        read_only_fields = ('id', 'user_name', 'user_avatar', 'created_at')

    def get_user_name(self, obj):
        return obj.user.get_display_name()

    def get_user_avatar(self, obj):
        return obj.user.get_display_name()[0].upper()


class ReviewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ('book', 'rating', 'text')

    def validate(self, data):
        request = self.context.get('request')
        if request and Review.objects.filter(book=data['book'], user=request.user).exists():
            raise serializers.ValidationError('You have already reviewed this book.')
        return data
