<template>
  <div class="container">
    <h2 class="text-center mb-4">TikTok アカウント管理</h2>
    <div v-if="error" class="alert alert-danger mt-3" role="alert">
      {{ error }}
    </div>
    <div v-if="success" class="alert alert-success mt-3" role="alert">
      {{ success }}
    </div>

    <form @submit.prevent="handleTikTokAuth" class="needs-validation mb-4">
      <p>以下のボタンをクリックするとTikTokで認証が行われ、アプリからの自動投稿を可能にします。</p>
      <button type="submit" class="btn btn-primary" :disabled="signingIn">
        {{ signingIn ? 'TikTok ログイン中...' : 'TikTok ログイン' }}
      </button>
    </form>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  data() {
    return {
      signingIn: false,
      error: null,
      success: null,
      
      mediaBucketUrl: process.env.VUE_APP_MEDIA_BUCKET_URL,
      siteUrl: process.env.VUE_APP_SITE_URL,
    };
  },
  computed: {
    ...mapGetters([
      'sessionUser'
    ]),
  },
  methods: {
    async handleTikTokAuth() {
      const userId = this.sessionUser?.idToken?.payload?.sub;
      if (!userId) {
        throw new Error('セッションが正しくありません');
      }
      try {
        this.signingIn = true;

        const authBaseUrl = 'https://www.tiktok.com/v2/auth/authorize';
        const clientKey = process.env.VUE_APP_TIKTOK_CLIENT_KEY || '';
        const redirectUri = `${process.env.VUE_APP_SITE_URL}/tiktok-redirect`;
        const csrfState = Math.random().toString(36).substring(2);
        const scope = 'user.info.basic,video.publish';
        const authUrl = `${authBaseUrl}/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${redirectUri}&state=${csrfState}`;
        window.location.href = authUrl;
      } catch (error) {
        this.error = 'TikTok ログインの手続きに失敗しました。再度お試しください。';
        console.error('TikTokログインルーティング失敗', error);
      } finally {
        this.signingIn = false;
      }
    },
  }
};
</script>

<style scoped></style>
