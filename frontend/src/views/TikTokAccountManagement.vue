<template>
  <div class="container">
    <h2 class="text-center mb-4">TikTokアカウント管理</h2>
    <div v-if="errorSave" class="alert alert-danger mt-3" role="alert">
      {{ errorSave }}
    </div>
    <div v-if="saveSuccess" class="alert alert-success mt-3" role="alert">
      {{ saveSuccess }}
    </div>
    <form @submit.prevent="submitForm" class="needs-validation">
      <div class="mb-3">
        <label for="media" class="form-label">txtファイルを選択</label>
        <input type="file" id="media" ref="mediaInput" class="form-control-file" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
        {{ saving ? '登録中...' : '登録'}}
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
    async submitForm() {
      this.clearMessages();
      this.saving = true;

      try {
        // 投稿IDを取得するため先に投稿のメタデータをDBに保存
        const userId = this.sessionUser?.idToken?.payload?.sub;
        const fileNameWithExtension = this.$refs.mediaInput.files[0].name;
        const fileNameBlocks = fileNameWithExtension.split('.');
        const extension = fileNameBlocks.pop();
        const filename = fileNameBlocks.join('');

        console.log({extension, filename})

        // バケット所有確認用ファイルをS3にアップロードするための署名付きURLを取得        
        const presigned = await this.getPresignedUrl({
          userId,
          filename,
          extension
        });

        console.log({presigned})

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
