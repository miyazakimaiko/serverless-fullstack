<template>
  <div class="container">
    <h2 class="mb-4">ユーザー管理</h2>

    <div v-if="loadingUsers" class="text-center">Loading...</div>

    <div v-if="error" class="alert alert-danger mt-3">{{ error }}</div>
    <div v-if="!error && deleteSuccess" class="alert alert-success mt-3">{{ deleteSuccess }}</div>

    <div v-if="users && users.length" class="row">
      <div v-for="user in users" :key="user.Username" class="mb-4">
        <div class="card m-auto" style="max-width: 30rem;">
          <div class="card-header">
            ユーザーID: {{ getUserAttribute(user, 'sub') }}
          </div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item">E メールアドレス: {{ getUserAttribute(user, 'email') }}</li>
            <li class="list-group-item">E メール確認済み: {{ getUserAttribute(user, 'email_verified') === 'true' ? 'はい' : 'いいえ'
              }}</li>
            <li class="list-group-item">
              <button
                @click="deleteUser(user)"
                :disabled="deletingUser || user.Username === sessionUser?.idToken?.payload?.sub"
                class="btn btn-danger">
                {{ deletingUser ? '削除中' : '削除' }}
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
  props: {
  },
  data() {
    return {
      users: null,
      loadingUsers: false,
      creatingUser: false,
      deletingUser: false,
      error: null,
      deleteSuccess: null,
      newUser: {
        email: '',
        password: ''
      }
    };
  },
  mounted() {
    this.getUsers();
  },
  computed: {
    ...mapGetters([
      'sessionUser',
    ]),
  },
  methods: {
    async getUsers() {
      this.loadingUsers = true;
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/users`;
        const response = await fetch(url, { method: 'GET' });
        const res = await response.json();
        this.users = res.users;
        this.loadingUsers = false;
      } catch (error) {
        console.error('ユーザーリスト取得失敗', error);
        this.error = 'ユーザーリスト取得に失敗しました。';
      }
    },
    getUserAttribute(user, attributeName) {
      const attribute = user.Attributes.find(attr => attr.Name === attributeName);
      return attribute ? attribute.Value : '';
    },
    async deleteUser(user) {
      this.error = null;
      this.deleteSuccess = null;
      this.deletingUser = true;
      try {
        const url = `${process.env.VUE_APP_API_ENDPOINT}api/user/${user.Username}`;
        const response = await fetch(url, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        await response.json();
        this.error = null;
        this.deleteSuccess = `ユーザーID: ${user.Username} を削除しました。`;
        this.getUsers();
      } catch (error) {
        console.error('削除失敗:', error);
        this.error = '削除に失敗しました。';
      } finally {
        this.deletingUser = false;
      }
    },
  }
};
</script>

<style scoped></style>
