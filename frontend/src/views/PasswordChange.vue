<template>
  <div class="container">
    <h2 class="text-center mb-4">パスワード変更</h2>
    <form @submit.prevent="changePassword" class="needs-validation">
      <div class="mb-3">
        <label for="current-password" class="form-label">現在のパスワード</label>
        <input type="password" id="current-password" v-model="currentPassword" class="form-control" required>
      </div>
      <div class="mb-3">
        <label for="new-password" class="form-label">新しいパスワード</label>
        <input type="password" id="new-password" v-model="newPassword" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block">パスワード変更</button>
      <div v-if="error && !success" class="alert alert-danger mt-3" role="alert">
        {{ error }}
      </div>
      <div v-if="success" class="alert alert-success mt-3" role="alert">
        パスワードが変更されました。
      </div>
    </form>
  </div>
</template>

<script>
import { AuthenticationDetails, CognitoUser } from 'amazon-cognito-identity-js';
import { mapMutations } from 'vuex';
import userPool from '@/user-pool';

export default {
  data() {
    return {
      email: '',
      currentPassword: '',
      newPassword: '',
      error: '',
      success: false,
    };
  },
  mounted() {
    this.getEmailAddress();
  },
  methods: {
    ...mapMutations([
      'clearUser',
    ]),
    getEmailAddress() {
      const user = userPool.getCurrentUser();
      if (user) {
        user.getSession((err, session) => {
          if (err) {
            console.error('セッション取得に失敗しました', err);
            this.clearUser();
            this.$router.push({ path: 'login' });
            return;
          }
          user.getUserAttributes((err, attributes) => {
            if (err) {
              console.error('ユーザーのAttribute取得に失敗しました', err);
              return;
            }
            const emailAttribute = attributes.find(attr => attr.getName() === 'email');
            if (emailAttribute) {
              this.email = emailAttribute.getValue();
            }
          });
        });
      }
    },
    changePassword() {
      const authenticationData = {
        Username: this.email,
        Password: this.currentPassword,
      };
      const authenticationDetails = new AuthenticationDetails(authenticationData);

      const userData = {
        Username: this.email,
        Pool: userPool
      };
      const cognitoUser = new CognitoUser(userData);

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: () => {
          cognitoUser.changePassword(this.currentPassword, this.newPassword, (err, result) => {
            if (err) {
              console.error('パスワード変更失敗:', err);
              this.error = 'パスワード変更に失敗しました。再度お試しください。';
            } else {
              console.log('パスワード変更成功:', result);
              this.success = true;
            }
          });
        },
        onFailure: err => {
          console.error('認証失敗:', err);
          this.error = '認証に失敗しました。パスワードを確認してください。';
        },
        newPasswordRequired: () => {
          console.error('現在のパスワードが不正確です');
          this.error = '現在のパスワードが不正確です。';
        }
      });
    },
  }
};
</script>

<style scoped></style>
