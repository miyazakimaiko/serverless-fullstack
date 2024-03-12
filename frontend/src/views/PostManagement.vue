<template>
  <div class="container">
    <h2 class="text-center mb-4">投稿管理</h2>
    <div v-if="errorSavePost" class="alert alert-danger mt-3" role="alert">
      {{ errorSavePost }}
    </div>
    <div v-if="saveSuccess" class="alert alert-success mt-3" role="alert">
      {{ saveSuccess }}
    </div>
    <form @submit.prevent="submitForm" class="needs-validation">
      <div class="mb-3">
        <label for="caption" class="form-label">キャプション</label>
        <textarea id="caption" v-model="caption" class="form-control" required></textarea>
      </div>
      <div class="mb-3">
        <label for="media" class="form-label">動画／画像を選択</label>
        <input type="file" id="media" ref="mediaInput" class="form-control-file" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
        {{ saving ? '登録中...' : '登録'}}
      </button>
    </form>
  </div>

  <div class="container mt-5">
    <h2 class="text-center mb-4">投稿一覧</h2>
    <div v-if="errorGetPosts" class="alert alert-danger mt-3" role="alert">
      {{ errorGetPosts }}
    </div>
    <div v-if="deleteSuccess" class="alert alert-success mt-3" role="alert">
      {{ deleteSuccess }}
    </div>
    <div>
      <p v-if="!getting && (!posts || posts.length === 0)">投稿がありません</p>
      <p v-if="getting">読み込み中...</p>
      <div v-for="post in posts" :key="post.id">
        <div class="card mb-4">
          <div class="card-header">
          動画・画像URL: 
          <a :href="mediaBucketUrl + '/' + sessionUser.idToken.payload.sub + '/' + post.id + '.' + post.extension" target="_blank">リンクを開く</a>
          </div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item">キャプション: {{ post.caption }}</li>
            <li class="list-group-item">登録日: {{ new Date(post.created_at) }}</li>
            <li class="list-group-item">前回投稿日: {{ post.last_posted_at ? new Date(post.last_posted_at) : null }}</li>
            <li class="list-group-item">次回投稿日: {{ post.last_posted_at ? new Date(post.last_posted_at) : null }}</li>
            <li class="list-group-item">
              <button
                @click="deletePost({ postId: post.id })"
                :disabled="deleting"
                class="btn btn-danger">
                {{ deleting && postIdToDelete === post.id ? '削除中' : '削除' }}
              </button>
            </li>
          </ul>
        </div>
      </div>
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
      errorSavePost: null,
      saveSuccess: null,
      saving: false,

      posts: null,
      getting: null,
      errorGetPosts: null,

      deleting: false,
      postIdToDelete: null,
      errorDeletePost: null,
      deleteSuccess: null,

      mediaBucketUrl: process.env.VUE_APP_MEDIA_BUCKET_URL
    };
  },
  computed: {
    ...mapGetters([
      'sessionUser'
    ]),
  },
  async mounted() {
    this.posts = await this.getPosts();
  },
  methods: {
    async submitForm() {
      this.clearMessages();
      this.saving = true;

      try {
        // 投稿IDを取得するため先に投稿のメタデータをDBに保存
        const userId = this.sessionUser?.idToken?.payload?.sub;
        const fileName = this.$refs.mediaInput.files[0].name;
        const extension = fileName.split('.').pop();

        const postMetadata = await this.savePostMetadata({
          userId,
          caption: this.caption,
          extension,
        });

        console.log({postMetadata})

        // 動画・画像をS3にアップロードするための署名付きURLを取得
        const postId = postMetadata.id;
        
        const presigned = await this.getPresignedUrl({
          userId,
          postId,
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
          this.errorSavePost = null;
          this.saveSuccess = '登録しました'
          this.posts = await this.getPosts();
        } 
      } catch (error) {
        console.error('登録失敗', error);
        this.errorSavePost = '登録に失敗しました。再度お試しください';
      } finally {
        this.saving = false;
      }
    },

    async savePostMetadata({ userId, caption, extension }) {
      try {
        if (!userId) {
          throw new Error('セッションが正しくありません');
        }

        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${userId}/post`;

        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            caption,
            extension,
          }),
        });
        const jsonRes = await response.json();

        if (response.ok) {
          return jsonRes;
        } else { 
          throw new Error(jsonRes.error || jsonRes.message);
        }
      } catch (error) {
        console.error('メタデータの登録失敗', error);
        this.errorSavePost = 'アップロードに失敗しました';
      }
    },

    async getPresignedUrl({ userId, postId, extension }) {
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${userId}/presigned-url`;
        const queryParams = new URLSearchParams({
          postId,
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
        this.errorSavePost = 'アップロードに失敗しました';
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
        this.errorSavePost = 'アップロードに失敗しました';
      }
    },

    async getPosts() {
      this.getting = true;
      this.errorGetPosts = null;

      try {
        const userId = this.sessionUser.idToken?.payload?.sub;
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${userId}/posts`;
        const response = await fetch(url, { method: 'GET' });

        const jsonRes = await response.json();

        if (response.ok) {
          return jsonRes.posts;
        } else { 
          throw new Error(jsonRes.error || jsonRes.message);
        }
      } catch (error) {
        console.error('全ポストのデータ取得失敗', error);
        this.errorGetPosts = '全ポストのデータ取得に失敗しました';
      } finally {
        this.getting = false;
      }
    },

    async deletePost({ postId }) {
      this.clearMessages();
      this.postIdToDelete = postId;
      this.deleting = true;

      try {
        const userId = this.sessionUser.idToken?.payload?.sub;
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${userId}/post/${postId}`;
        const response = await fetch(url, { method: 'DELETE' });

        const jsonRes = await response.json();

        if (response.ok) {
          this.deleteSuccess = 'ポストを削除しました';
          this.posts = await this.getPosts();
          return jsonRes.posts;
        } else { 
          throw new Error(jsonRes.error || jsonRes.message);
        }
      } catch (error) {
        console.error('ポスト削除失敗', error);
        this.errorDeletePost = 'ポストの削除に失敗しました';
      } finally {
        this.postIdToDelete = null;
        this.deleting = false;
      }
    },

    clearMessages() {
      this.errorSavePost = null;
      this.errorDeletePost = null;
      this.errorGetPosts = null;
      this.saveSuccess = null;
      this.deleteSuccess = null;
    }
  }
};
</script>

<style scoped></style>
