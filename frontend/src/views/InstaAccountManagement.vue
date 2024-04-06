<template>
  <div class="container">
    <h2 class="text-center mb-4">Instagram アカウント管理</h2>
    <div v-if="errorSave" class="alert alert-danger mt-3" role="alert">
      {{ errorSave }}
    </div>
    <div v-if="saveSuccess" class="alert alert-success mt-3" role="alert">
      {{ saveSuccess }}
    </div>

    <form @submit.prevent="handleFacebookAuth" class="needs-validation mb-4">
      <p>以下のボタンをクリックするとFacebookで認証が行われ、アプリからの自動投稿を可能にします。</p>
      <button type="submit" class="btn btn-primary" :disabled="signingIn">
        Facebook ログイン
      </button>
    </form>

    <form @submit.prevent="saveAccessToken" class="needs-validation mb-4">
      <div class="mb-3">
        <label for="accountId" class="form-label">アカウントID</label>
        <input type="text" id="accountId" v-model="accountId" class="form-control" required :disabled="saving">
      </div>
      <div class="mb-3">
        <label for="accessToken" class="form-label">長期アクセストークン</label>
        <input type="text" id="accessToken" v-model="accessToken" class="form-control" required :disabled="saving">
      </div>
      <button type="submit" class="btn btn-primary" :disabled="saving">
        {{ saving ? '登録中...' : '登録' }}
      </button>
    </form>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  data() {
    return {
      mediaBucketUrl: process.env.VUE_APP_MEDIA_BUCKET_URL,
      siteUrl: process.env.VUE_APP_SITE_URL,

      fbUserData: null,

      accountId: null,
      accessToken: null,

      errorSave: null,
      saveSuccess: null,
      saving: false,
    };
  },
  computed: {
    ...mapGetters([
      'sessionUser'
    ]),
  },
  methods: {
    async handleFacebookAuth() {
      const scopeArray = [
        'public_profile',
        'email',
        'publish_video',
        'pages_show_list',
        'business_management',
        'instagram_basic',
        'instagram_manage_insights',
        'instagram_content_publish'
      ];
      try {
        await FB.login(this.loginCallback, {
          scope: scopeArray.join(','),
        });
      } catch (error) {
        console.error('error', error);
      }
    },

    async loginCallback(response) {
      console.log({ loginRes: response })

      if (!response?.authResponse || response?.status !== 'connected') {
        console.log('ログイン中断または認証に失敗');
        return;
      }

      this.fbUserData = response.authResponse;

      const { accessToken, userID } = response.authResponse;

      console.log({ accessToken })

      const longLivedTokenRes = await this.getLongLivedUserAccessToken({
        fbUserId: userID,
        shortLivedUserToken: accessToken
      });
    },

    async getLongLivedUserAccessToken({ fbUserId, shortLivedUserToken }) {
      try {
        const userId = this.sessionUser?.idToken?.payload?.sub;
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/account/insta/long-lived-user-token`;
        const queryParams = new URLSearchParams({
          fbUserId,
          accessToken: shortLivedUserToken,
        });
        const saveTokenRes = await fetch(`${url}?${queryParams}`, {
          method: 'GET',
        });
        const saveTokenJsonRes = await saveTokenRes.json();

        console.log({ saveTokenJsonRes })
        return saveTokenJsonRes;
      } catch (error) {
        console.error('長期ユーザーアクセストークン取得失敗', error);
      }
    },

    async saveAccessToken() {
      this.clearMessages();

      try {
        const userId = this.sessionUser?.idToken?.payload?.sub;
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/account/insta/tokens`;

        const saveTokenRes = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            accountId: this.accountId,
            accessToken: this.accessToken,
          }),
        });
        const saveTokenJsonRes = await saveTokenRes.json();

        if (!saveTokenRes.ok) {
          throw new Error(saveTokenJsonRes.error || saveTokenJsonRes.message);
        }

        this.saveSuccess = saveTokenJsonRes.message;
        return saveTokenJsonRes;
      } catch (error) {
        console.error('クライアントキーの登録失敗', error);
        this.errorSave = 'クライアントキーの登録に失敗しました';
      }
    },

    clearMessages() {
      this.errorSave = null;
      this.saveSuccess = null;
    },
  }
};
</script>

<style scoped></style>
