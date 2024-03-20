<template>
  <div class="container">
    <h2 class="text-center mb-4">Instagram アカウント管理</h2>
    <div v-if="errorSave" class="alert alert-danger mt-3" role="alert">
      {{ errorSave }}
    </div>
    <div v-if="saveSuccess" class="alert alert-success mt-3" role="alert">
      {{ saveSuccess }}
    </div>

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
    clearMessages() {
      this.errorSave = null;
      this.saveSuccess = null;
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
  }
};
</script>

<style scoped></style>
