<template>
  <div class="container">
    <h2 class="text-center mb-4">TikTokアカウント管理</h2>
    <div v-if="errorSave" class="alert alert-danger mt-3" role="alert">
      {{ errorSave }}
    </div>
    <div v-if="saveSuccess" class="alert alert-success mt-3" role="alert">
      {{ saveSuccess }}
    </div>

    <!-- Existing form for selecting and uploading media files -->
    <form @submit.prevent="prooveBucketOwnership" class="needs-validation mb-4">
      <p>URL properties のセクションにこのURLを追加する {{ mediaBucketUrl }}/{{ this.sessionUser?.idToken?.payload?.sub }}/</p>
      <div class="mb-3">
        <label for="media" class="form-label">txtファイルを選択</label>
        <input type="file" id="media" ref="mediaInput" class="form-control-file" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
        {{ saving ? '登録中...' : '登録' }}
      </button>
    </form>

    <!-- New form for entering client key and client secret -->
    <form @submit.prevent="handleTikTokAuth" class="needs-validation mb-4">
      <div class="mb-3">
        <label for="clientKey" class="form-label">クライアントキー</label>
        <input type="text" id="clientKey" v-model="clientKey" class="form-control" required :disabled="saving">
      </div>
      <div class="mb-3">
        <label for="clientSecret" class="form-label">クライアントシークレット</label>
        <input type="text" id="clientSecret" v-model="clientSecret" class="form-control" required :disabled="saving">
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
      errorSave: null,
      saveSuccess: null,
      saving: false,
      mediaBucketUrl: process.env.VUE_APP_MEDIA_BUCKET_URL
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
        await this.saveClientKeys(userId);

        const REDIRECT_URI = 'https://d32lvnv31xi4tj.cloudfront.net/tiktok/redirect';
        const csrfState = Math.random().toString(36).substring(2);
        const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${this.clientKey}&scope=user.info.basic&response_type=code&redirect_uri=${REDIRECT_URI}&state=${csrfState}`;
        window.location.href = authUrl;
      } catch (error) {
        console.error('Error redirecting to TikTok authorization:', error);
      }
    },

    async saveClientKeys(userId) {
      this.clearMessages();
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${userId}/account/tiktok/client-keys`;

        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            clientKey: this.clientKey,
            clientSecret: this.clientSecret,
          }),
        });
        const jsonRes = await response.json();

        if (response.ok) {
          this.saveSuccess = 'クライアントキーを登録しました';
          return jsonRes;
        } else {
          throw new Error(jsonRes.error || jsonRes.message);
        }
      } catch (error) {
        console.error('クライアントキーの登録失敗', error);
        this.errorSave = 'クライアントキーの登録に失敗しました';
      }
    },

    async prooveBucketOwnership() {
      this.clearMessages();
      this.saving = true;

      try {
        // 投稿IDを取得するため先に投稿のメタデータをDBに保存
        const userId = this.sessionUser?.idToken?.payload?.sub;
        const fileNameWithExtension = this.$refs.mediaInput.files[0].name;
        const fileNameBlocks = fileNameWithExtension.split('.');
        const extension = fileNameBlocks.pop();
        const filename = fileNameBlocks.join('');

        console.log({ extension, filename })

        // バケット所有確認用ファイルをS3にアップロードするための署名付きURLを取得        
        const presigned = await this.getPresignedUrl({
          userId,
          filename,
          extension
        });

        console.log({ presigned })

        // 動画・画像をS3にアップロード
        const form = new FormData();
        Object.keys(presigned.fields).forEach(key => {
          form.append(key, presigned.fields[key]);
        })
        form.append('file', this.$refs.mediaInput.files[0]);

        const uploaded = await this.uploadMediaFiles({
          presignedUrl: presigned.url,
          form,
        });

        if (uploaded.ok) {
          this.caption = '';
          this.$refs.mediaInput.value = null;
          this.errorSave = null;
          this.saveSuccess = '登録しました'
        }
      } catch (error) {
        console.error('登録失敗', error);
        this.errorSave = '登録に失敗しました。再度お試しください';
      } finally {
        this.saving = false;
      }
    },

    async getPresignedUrl({ userId, filename, extension }) {
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${userId}/presigned-url`;
        
        const queryParams = new URLSearchParams({
          tikTokBucketVerificationFileName: filename,
          extension
        });
        const response = await fetch(`${url}?${queryParams}`, { method: 'GET' });
        const jsonRes = await response.json();

        if (response.ok) {
          return jsonRes;
        } else {
          throw new Error(jsonRes.error || jsonRes.message);
        }
      } catch (error) {
        console.error('署名付きポストURLの取得失敗', error);
        this.errorSave = 'アップロードに失敗しました';
      }
    },

    async uploadMediaFiles({ presignedUrl, form }) {
      try {
        const response = await fetch(presignedUrl, {
          method: 'POST',
          body: form,
        });
        if (response.ok) {
          return response;
        } else {
          throw new Error(response.error || response.message);
        }
      } catch (error) {
        console.error('S3へのアップロード失敗', error);
        this.errorSave = 'アップロードに失敗しました';
      }
    },

    clearMessages() {
      this.errorSave = null;
      this.saveSuccess = null;
    }
  }
};
</script>

<style scoped></style>
