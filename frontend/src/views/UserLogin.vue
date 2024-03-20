<template>
  <div class="container">
    <h2 class="text-center mb-4">ログイン</h2>
    <form @submit.prevent="login" class="needs-validation">
      <div class="mb-3">
        <label for="email" class="form-label">メールアドレス</label>
        <input type="email" id="email" v-model="email" class="form-control" required>
      </div>
      <div class="mb-3">
        <label for="password" class="form-label">パスワード</label>
        <input type="password" id="password" v-model="password" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" :disabled="processing">
        {{ processing ? 'ログイン中...' : 'ログイン' }}
      </button>
    </form>
    <p class="mt-3 text-center">アカウントをお持ちでない方は <router-link to="/register">登録</router-link></p>
    <div v-if="error" class="alert alert-danger mt-3" role="alert">
      {{ error }}
    </div>
  </div>
</template>

<script>
import { AuthenticationDetails, CognitoUser } from 'amazon-cognito-identity-js';
import userPool from '../user-pool';
import { mapMutations } from 'vuex';

export default {
  data() {
    return {
      email: '',
      password: '',
      error: '',
      processing: false,
    };
  },
  methods: {
    ...mapMutations([
      'setUser',
    ]),
    login() {
      this.processing = true;

      const authenticationDetails = new AuthenticationDetails({
        Username: this.email,
        Password: this.password,
      });

      const cognitoUser = new CognitoUser({
        Username: this.email,
        Pool: userPool
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: session => {
          console.log('認証成功しました');
          this.setUser(session);
          this.$router.push({ path: 'posts' });
        },
        onFailure: err => {
          console.error('認証失敗しました', err);
          this.error = '認証中にエラーが発生しました。再度お試しください。';
          this.processing = false;
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          console.log('新しいパスワードが必要です', userAttributes, requiredAttributes);
          this.error = '新しいパスワードが必要です。';
          this.processing = false;
        },
      })
    },
  }
};
</script>

<style scoped></style>