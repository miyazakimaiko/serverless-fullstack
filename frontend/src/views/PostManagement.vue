<template>
  <div class="container">
    <h2 class="text-center mb-4">投稿管理</h2>
    <div v-if="errorSavePost" class="alert alert-danger mt-3" role="alert">
      {{ errorSavePost }}
    </div>
    <div v-if="saveSuccess" class="alert alert-success mt-3" role="alert">
      {{ saveSuccess }}
    </div>
    <form @submit.prevent="submitSavePostForm" class="needs-validation">
      <div class="mb-3" style="white-space: pre-wrap;">
        <label for="caption" class="form-label">TikTok/インスタ キャプション (最大2200文字)</label>
        <textarea id="caption" v-model="caption" class="form-control h-8"></textarea>
      </div>
      <div class="mb-3">
        <label for="media" class="form-label">動画/画像を選択</label>
        <input type="file" id="media" ref="mediaInput" class="form-control-file" required>
      </div>
      <div class="mb-3 text-muted">
        <p>ファイルサイズが大きすぎる場合、またはサポートされていない形式の場合はアップロードできません。</p>
        <p>制限事項<br />サポートされている形式: JPG, MP4, MOV<br />最大動画サイズ: 1GB, 最大画像サイズ: 8MB<br />動画の長さ: 最長 10分、最短 3秒</p>
      </div>
      <div v-if="posts && posts.length >= maxPostCounts">
        <p>登録された投稿の数が最大値に達しました。({{ maxPostCounts }} 投稿)<br />新たに登録が必要な場合は、既存の投稿を削除してください。</p>
      </div>
      <button type="submit" class="btn btn-primary btn-block"
        :disabled="saving || (posts && posts.length >= maxPostCounts)">
        {{ saving ? '登録中...' : '登録' }}
      </button>
    </form>
  </div>

  <div class="container mt-5">
    <h2 class="text-center mb-4">投稿一覧 (登録順)</h2>
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
            <a :href="mediaBucketUrl + '/' + sessionUser?.idToken?.payload?.sub + '/' + post.id + '.' + post.extension"
              target="_blank">リンクを開く</a>
          </div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item" style="white-space: pre-line;">キャプション: {{ post.caption }}</li>
            <li class="list-group-item">登録日: {{ new Date(post.createdAt) }}</li>
            <li class="list-group-item">前回の投稿: {{ post.lastPostedAt ? new Date(post.lastPostedAt) : null }}</li>
            <li class="list-group-item">次回の投稿予定: {{ post.nextPostedAt ? new Date(post.nextPostedAt) : null }}</li>
            <li class="list-group-item">
              <button
                @click="setPostToDelete(post)"
                data-bs-toggle="modal" data-bs-target="#postDeletionModal"
                :disabled="deleting"
                class="btn btn-danger">
                {{ deleting && postToDelete.id === post.id ? '削除中' : '削除' }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="postDeletionModal" tabindex="-1" aria-labelledby="postDeletionModalLabel"
    aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="postDeletionModalLabel">投稿削除</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          投稿: {{ postToDelete ? postToDelete.caption.slice(0, 20) : '' }}... を削除します。よろしいですか？
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">いいえ</button>
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal" @click="deletePost({ postId: postToDelete.id, withMessage: true })">はい</button>
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
      maxPostCounts: 20,
      getting: null,
      errorGetPosts: null,

      deleting: false,
      postToDelete: null,
      errorDeletePost: null,
      deleteSuccess: null,

      mediaBucketUrl: process.env.VUE_APP_MEDIA_BUCKET_URL,
      validVideoFileTypes: ['video/mp4', 'video/quicktime'],
      validImageFileTypes: ['image/jpeg'],
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
    async getPosts() {
      this.getting = true;
      this.errorGetPosts = null;

      try {
        const userId = this.sessionUser.idToken?.payload?.sub;
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/posts`;
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

    async submitSavePostForm() {
      this.clearMessages();
      this.saving = true;
      let postId;

      try {
        // 投稿IDを取得するため先に投稿のメタデータをDBに保存
        const userId = this.sessionUser?.idToken?.payload?.sub;
        const file = this.$refs.mediaInput.files[0];
        const extension = file.name.split('.').pop().toLowerCase();
        const fileType = this.getValidFileType(file);

        if (!fileType) {
          this.errorSavePost = 'サポートされていない形式のファイルです';
          return;
        }

        const fileSizeIsValid = this.isValidFileSize(file, fileType);

        if (!fileSizeIsValid) {
          this.errorSavePost = '制限以上の動画または画像のサイズです';
          return;
        }

        if (fileType === 'video') {
          const durationInSeconds = await this.getVideoDuration(file);
  
          if (durationInSeconds > 600 || durationInSeconds < 3) {
            this.errorSavePost = '動画の長さが 10分以上、または3秒以下です';
            return;
          }
        }

        if (this.caption.length > 2200) {
          this.errorSavePost = 'キャプションの文字数が最大値を超えています';
          return;
        }

        const postMetadata = await this.savePostMetadata({
          userId,
          caption: this.caption,
          extension,
        });

        // 動画・画像をS3にアップロードするための署名付きURLを取得
        postId = postMetadata.id;

        const presigned = await this.getPresignedUrl({
          userId,
          postId,
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
          this.errorSavePost = null;
          this.saveSuccess = '登録しました';
          this.posts = await this.getPosts();
        }
      } catch (error) {
        console.error('登録失敗', error);
        // savePostMetadata成功後にエラーが発生した場合、メタデータのみがDBに残ってしまうため ここで削除
        // 削除成功・失敗のメッセージは表示しない
        if (postId) {
          await this.deletePost({
            postId,
            withMessage: false,
          });
        }
        this.errorSavePost = '登録に失敗しました。再度お試しください';
      } finally {
        this.saving = false;
      }
    },

    getValidFileType(file) {
      try {
        if (this.validVideoFileTypes.includes(file.type)) {
          return 'video';
        }
        if (this.validImageFileTypes.includes(file.type)) {
          return 'image';
        }
        return;
      } catch (error) {
        console.log('ファイルタイプ検証失敗', error);
      }
    },

    isValidFileSize(file, fileType) {
      const videoMaxSizeInByte = 1_073_741_824; // 1GB
      const imageMaxSizeInByte = 8_388_608; // 8MB

      if (fileType === 'video') {
        return file.size <= videoMaxSizeInByte;
      }
      if (fileType === 'image') {
        return file.size <= imageMaxSizeInByte;
      }
      return false;
    },

    getVideoDuration(file) {
      return new Promise((resolve, reject) => {
        try {
          const video = document.createElement('video');
          video.onloadedmetadata = () => {
            resolve(video.duration);
          };
          video.onerror = (error) => {
            reject(error);
          };
          video.src = URL.createObjectURL(file);
        } catch (error) {
          console.error('Failed to get video duration:', error);
          reject(error);
        }
      });
    },

    async savePostMetadata({ userId, caption, extension }) {
      try {
        if (!userId) {
          throw new Error('セッションが正しくありません');
        }

        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/post`;

        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            caption: caption.replace(/\n/g, '\n\r'),
            extension: extension.toLowerCase(),
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
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/presigned-url`;
        const queryParams = new URLSearchParams({
          postId,
          extension: extension.toLowerCase(),
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
        throw error;
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

    async setPostToDelete(post) {
      this.postToDelete = post;

    },

    async deletePost({ postId, withMessage }) {
      this.clearMessages();
      this.deleting = true;

      try {
        const userId = this.sessionUser.idToken?.payload?.sub;
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user/${userId}/post/${postId}`;
        const response = await fetch(url, { method: 'DELETE' });

        const jsonRes = await response.json();

        if (response.ok) {
          this.deleteSuccess = withMessage ? 'ポストを削除しました' : '';
          this.posts = await this.getPosts();
          return jsonRes.posts;
        } else {
          throw new Error(jsonRes.error || jsonRes.message);
        }
      } catch (error) {
        console.error('ポスト削除失敗', error);
        if (withMessage) {
          this.errorDeletePost = 'ポストの削除に失敗しました';
        }
      } finally {
        this.deleting = false;
      }
    },

    clearMessages() {
      this.errorGetPosts = null;

      this.saveSuccess = null;
      this.errorSavePost = null;

      this.deleteSuccess = null;
      this.errorDeletePost = null;
    }
  }
};
</script>

<style scoped></style>
