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
        <button type="submit" class="btn btn-primary btn-block" :disabled="creating">登録</button>
        <div v-if="error" class="alert alert-danger mt-3" role="alert">
          {{ error }}
        </div>
      </form>
      <p class="mt-3 text-center">既にアカウントをお持ちの方は <router-link to="/login">ログイン</router-link></p>
    </div>
    <div v-if="created">
      <form @submit.prevent="verifyCode" class="needs-validation">
        <div class="mb-3">
          <label for="verification-code" class="form-label">確認コード</label>
          <input type="text" id="verification-code" v-model="verificationCode" class="form-control" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">確認</button>
        <div v-if="error" class="alert alert-danger mt-3" role="alert">
          {{ error }}
        </div>
      </form>
    </div>
  </div>
</template>

<script>

export default {
  data() {
    return {
      email: '',
      password: '',
      passwordRetype: '',
      creating: false,
      created: false,
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

      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: this.email,
            password: this.password
          })
        });
        if (response.status !== 200) {
          const details = await response.json();
          throw Error(details.error || details.message);
        }
        this.created = true;
        this.error = '';
      } catch (error) {
        console.error('ユーザーの作成中にエラーが発生しました:', error);
        this.error = 'ユーザーの作成中にエラーが発生しました。再度お試しください。';
      } finally {
        this.creating = false;
      }
    },
    async verifyCode() {
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/verify-code`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: this.email,
            code: this.verificationCode
          })
        });
        const data = await response.json();

        if (data.success) {
          console.log('確認コードが認証されました。ログインページに移行します');
          this.$router.push({ path: 'login' });
        } else {
          this.error = '確認コードが無効です。もう一度お試しください。';
        }
      } catch (error) {
        console.error('確認コードの確認中にエラーが発生しました:', error);
        this.error = '確認コードの確認中にエラーが発生しました。再度お試しください。';
      }
    }
  }
};
</script>
