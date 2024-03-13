<template>
  <div>
    <div v-if="error" class="alert alert-danger" role="alert">
      <p>認証に失敗しました。再度お試しください。<a class="link-opacity-100" @click="goBack">TikTokアカウント管理に戻る</a></p>
    </div>
    <div v-else-if="success" class="alert alert-success" role="alert">
      <p>認証に成功しました。管理ページに戻ります</p>
      <!-- You can add additional content or actions here -->
    </div>
    <div v-else>
      <h1>認証しています。少々お待ちください...</h1>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  data() {
    return {
      error: false,
      success: false
    };
  },
  async mounted() {
    const userId = this.sessionUser?.idToken?.payload?.sub;

    if (!userId) {
      throw new Error('セッションが正しくありません');
    }
    const params = new URLSearchParams(window.location.search);
    const authorizationCode = params.get('code');
    const scopes = params.get('scopes');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error || !authorizationCode) {
      console.error('認証エラー', error);
      console.error('TikTok認証エラー内容', errorDescription);
      this.error = true;
    } else {
      const response = await this.fetchAndSaveAccessToken({
        authorizationCode,
        userId
      });

      if (!storeRes.ok) {
        console.error('トークン保存エラー', storeRes.status, storeRes.statusText);
        this.error = true;
      } else {
        this.success = true;
        setTimeout(() => {
          this.goBack();
        }, 4000);
      }
    }
  },
  computed: {
    ...mapGetters([
      'sessionUser'
    ]),
  },
  methods: {
    goBack() {
      window.history.back();
    },
    async fetchAndSaveAccessToken({ authorizationCode, userId }) {
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${userId}/account/tiktok/token`;

        const queryParams = new URLSearchParams({
          authorizationCode,
        });

        const response = await fetch(`${url}?${queryParams}`, {
          method: 'POST',
        });
        const jsonRes = await response.json();

        if (response.ok) {
          this.saveSuccess = 'アクセストークンを登録しました';
          return jsonRes;
        } else {
          throw new Error(jsonRes.error || jsonRes.message);
        }
      } catch (error) {
        console.error('アクセストークンの登録失敗', error);
        this.errorSave = 'アクセストークンの登録に失敗しました';
      }
    },
    calculateExpiryTime(expiresInSeconds) {
      const currentTime = Math.floor(Date.now() / 1000);
      const expiryTime = currentTime + expiresInSeconds;
      return expiryTime;
    }
  }
};
</script>

<style scoped></style>
