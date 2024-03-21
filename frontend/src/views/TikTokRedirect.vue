<template>
  <div class="container">
    <div v-if="error" class="alert alert-danger" role="alert">
      認証に失敗しました。再度お試しください。<a class="link-opacity-100" role="button" @click="routeToMainPage">戻る</a>
    </div>
    <div v-else-if="!error && success" class="alert alert-success" role="alert">
      認証に成功しました。管理ページに戻ります
    </div>
    <div v-else>
      認証しています。少々お待ちください...
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import userPool from '@/user-pool';

export default {
  data() {
    return {
      error: false,
      success: false
    };
  },
  async mounted() {
    try {
      const session = userPool.getCurrentUser();
      const userId = session?.username;

      if (!userId) {
        this.error = true;
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const authorizationCode = params.get('code');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (error || !authorizationCode) {
        console.error('認証エラー', error, errorDescription);
        this.error = true;
        return;
      }

      const response = await this.fetchAndSaveAccessToken({
        authorizationCode,
        userId
      });

      const jsonRes = await response.json();

      if (!response.ok) {
        console.error('トークンエラー', jsonRes);
        this.error = true;
        return;
      }

      this.error = false;
      this.success = true;

      setTimeout(() => {
        this.routeToMainPage();
      }, 3000);
    } catch (error) {
      console.error('エラー', error);
      this.error = true;
    }
  },
  computed: {
    ...mapGetters([
      'sessionUser'
    ]),
  },
  methods: {
    async fetchAndSaveAccessToken({ authorizationCode, userId }) {
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/account/tiktok/tokens`;

        const queryParams = new URLSearchParams({
          authorizationCode,
          userId,
        });

        return await fetch(`${url}?${queryParams}`, {
          method: 'POST',
        });
      } catch (error) {
        console.error('アクセストークンの取得または保存失敗', error);
        throw error;
      }
    },

    routeToMainPage() {
      window.location.href = process.env.VUE_APP_SITE_URL;
    }
  }
};
</script>

<style scoped></style>
