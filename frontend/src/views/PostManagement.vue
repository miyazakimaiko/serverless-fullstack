<template>
  <div class="container">
    <h2 class="text-center mb-4">投稿管理</h2>
    <form @submit.prevent="submitForm" class="needs-validation">
      <div class="mb-3">
        <label for="caption" class="form-label">キャプション</label>
        <textarea id="caption" v-model="caption" class="form-control" required></textarea>
      </div>
      <div class="mb-3">
        <label for="media" class="form-label">メディアを選択</label>
        <input type="file" id="media" ref="mediaInput" class="form-control-file" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" :disabled="submitting">登録</button>
    </form>
    <div v-if="error" class="alert alert-danger mt-3" role="alert">
      {{ error }}
    </div>
    <div v-if="uploadSuccess" class="alert alert-success mt-3" role="alert">
      {{ uploadSuccess }}
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  data() {
    return {
      caption: '',
      media: null,
      error: null,
      uploadSuccess: null,
      submitting: false,
    };
  },
  computed: {
    ...mapGetters([
      'sessionUser'
    ]),
  },
  methods: {
    async submitForm() {
      this.error = null;
      this.uploadSuccess = null;
      this.submitting = true;

      try {
        // 投稿のメタデータをDBに保存する
        const userId = this.sessionUser?.idToken?.payload?.sub;

        const postMetadata = await this.savePostMetadata({
          userId,
          caption: this.caption
        });

        // 動画・画像をS3にアップロードするための署名付きURLを取得する
        const postId = postMetadata.id;
        const fileName = this.$refs.mediaInput.files[0].name;
        const extension = fileName.split('.').pop();

        const presigned = await this.getPresignedUrl({
          userId,
          postId,
          extension
        });

        // 動画・画像をS3にアップロードする
        const form = new FormData();
        Object.keys(presigned.fields).forEach(key => {
          form.append(key, presigned.fields[key]);
        })
        form.append('file', this.$refs.mediaInput.files[0]);

        const uploaded = await this.uploadMediaFiles({
          presignedUrl: presigned.url,
          form,
        });

        if (uploaded.status >= 200) {
          this.caption = '';
          this.$refs.mediaInput.value = null;
          this.error = null;
          this.uploadSuccess = '登録しました。'
        }
      } catch (error) {
        console.error('登録失敗', error);
        this.error = '登録に失敗しました。再度お試しください。';
      } finally {
        this.submitting = false;
      }
    },
    async savePostMetadata({ userId, caption }) {
      try {
        if (!userId) {
          throw new Error('セッションが正しくありません');
        }

        const url = `${process.env.VUE_APP_API_ENDPOINT}api/post`;

        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            userId,
            caption,
          }),
        });
        const res = await response.json();
        return res;

      } catch (error) {
        console.error('メタデータの登録失敗', error);
        this.error = 'アップロードに失敗しました。';
      }
    },
    async getPresignedUrl({ userId, postId, extension }) {
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/presigned-url`;
        const queryParams = new URLSearchParams({
          userId,
          postId,
          extension
        });
        const response = await fetch(`${url}?${queryParams}`, { method: 'GET' });
        return await response.json();
      } catch (error) {
        console.error('署名付きポストURLの取得失敗', error);
        this.error = 'アップロードに失敗しました。';
      }
    },
    async uploadMediaFiles({ presignedUrl, form }) {
      try {
        const response = await fetch(presignedUrl, {
          method: 'POST',
          body: form
        });
        return response;
      } catch (error) {
        console.error('S3へのアップロード失敗', error);
        this.error = 'アップロードに失敗しました。';
      }
    },
  }
};
</script>

<style scoped></style>
