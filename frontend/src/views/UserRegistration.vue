<template>
  <div class="container">
    <h2 class="text-center mb-4">新規登録</h2>
    <div v-if="!created">
      <form @submit.prevent="register" class="needs-validation">
        <div class="mb-3">
          <label for="email" class="form-label">メールアドレス</label>
          <input type="email" id="email" v-model="email" class="form-control" required>
        </div>
        <div class="mb-3">
          <label for="password" class="form-label">パスワード</label>
          <input type="password" id="password" v-model="password" class="form-control" required>
        </div>
        <div class="mb-3">
          <label for="password-retype" class="form-label">パスワード再入力</label>
          <input type="password" id="password-retype" v-model="passwordRetype" class="form-control" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="creating">
          {{ creating ? '登録中...' : '登録' }}
        </button>
        <div v-if="error" class="alert alert-danger mt-3" role="alert">
          {{ error }}
        </div>
      </form>
      <p class="mt-3 text-center">既にアカウントをお持ちの方は <router-link to="/login">ログイン</router-link></p>
    </div>
    <div v-if="created">
      <p>メールアドレスへ確認コードを送信しました。</p>
      <form @submit.prevent="verifyCode" class="needs-validation">
        <div class="mb-3">
          <label for="verification-code" class="form-label">確認コード</label>
          <input type="text" id="verification-code" v-model="verificationCode" class="form-control" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="verifying">
          {{ verifying ? '確認中...' : '確認' }}
        </button>
        <div v-if="verifiedMessage" class="alert alert-success mt-3" role="alert">
          {{ verifiedMessage }}
        </div>
        <div v-if="error" class="alert alert-danger mt-3" role="alert">
          {{ error }}
        </div>
      </form>
    </div>
  </div>
</template>

<script>
import userPool from '@/user-pool';

export default {
  data() {
    return {
      email: '',
      password: '',
      passwordRetype: '',
      cognitoUser: null,

      creating: false,
      created: false,

      verifying: false,
      verifiedMessage: null,
      error: null,
    };
  },
  methods: {
    async register() {
      this.error = null;
      this.created = false;

      if (this.password !== this.passwordRetype) {
        this.error = 'パスワードとパスワード再入力の値が一致していません。';
        return;
      }

      this.creating = true;

      userPool.signUp(this.email, this.password, null, null, (error, data) => {
        if (error) {
          console.error('ユーザー作成失敗:', error);
          this.error = 'ユーザーの作成中にエラーが発生しました。再度お試しください。';
          this.creating = false;
        } else {
          this.cognitoUser = data.user;
          this.addUserToUserGroup(data.user);
        }
      });
    },

    async addUserToUserGroup() {
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}/user`;
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: this.email,
            isAdmin: false,
          })
        });
        if (response.status !== 200) {
          const details = await response.json();
          throw Error(details.error || details.message);
        }
      } catch (error) {
        console.error('グループ追加失敗:', error);
        this.error = 'ユーザーの作成中にエラーが発生しました。';
        this.creating = false;
      } finally {
        this.error = null;
        this.created = true;
        this.creating = false;
      }
    },

    async verifyCode() {
      this.error = null;
      this.verifying = true;
      this.verifiedMessage = null;

      await this.cognitoUser.confirmRegistration(
        this.verificationCode,
        true,
        (error, _) => {
          if (error) {
            console.error('確認コードの確認中にエラーが発生しました:', error);
            this.error = '確認コードの確認中にエラーが発生しました。再度お試しください。';
          }
          else {
            this.verifiedMessage = '確認コードが認証されました。ログインページに移行します';
            setTimeout(() => {
              this.$router.push({ path: '/login' });
            }, 3000);
          }
          this.verifying = false;
        }
      );
    }
  }
};
</script>
