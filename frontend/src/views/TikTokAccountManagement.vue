<template>
  <div class="container">
    <h2 class="text-center mb-4">TikTok アカウント管理</h2>
    <div v-if="error" class="alert alert-danger mt-3" role="alert">
      {{ error }}
    </div>
    <div v-if="success" class="alert alert-success mt-3" role="alert">
      {{ success }}
    </div>

    <!-- <h3 class="mb-4">ステップ１：アプリの申請をする</h3>
    <form @submit.prevent="proveBucketOwnership" class="needs-validationstart mb-4">
      <ol class="text-start">
        <li><a href="https://developers.tiktok.com/">https://developers.tiktok.com/</a>にログインし、アプリを作成します。</li>
        <li>「 LoginKit」の「Web」セクションに次のURLを追加してください。<strong>{{ siteUrl }}/tiktok/redirect</strong></li>
        <li>「URL properties」のセクションに次のURLを追加してください。 <strong>{{ mediaBucketUrl }}/{{ this.sessionUser?.idToken?.payload?.sub }}/</strong></li>
        <li>「Verify Property」をクリックします。表示されたtxtファイルをダウンロードし、以下のフォームからダウンロードしたファイルを登録してください。</li>
      </ol>
      <div class="mb-3">
        <label for="media" class="form-label">txtファイルを選択</label>
        <input type="file" id="media" ref="mediaInput" class="form-control-file" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
        {{ saving ? '登録中...' : '登録' }}
      </button>
    </form> -->

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
        const redirectUrl = `${VUE_APP_SITE_URL}/tiktok-redirect`;
        const csrfState = Math.random().toString(36).substring(2);
        const authUrl = `${authBaseUrl}/?client_key=${clientKey}&scope=user.info.basic&response_type=code&redirect_uri=${redirectUrl}&state=${csrfState}`;
        window.location.href = authUrl;
      } catch (error) {
        this.error = 'TikTok ログインの手続きに失敗しました。再度お試しください。';
        console.error('TikTokログインルーティング失敗', error);
      } finally {
        this.signingIn = false;
      }
    },

    async saveClientKeys(userId) {
      this.clearMessages();
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/account/tiktok/client-keys`;

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

    async proveBucketOwnership() {
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
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/presigned-url`;
        
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
