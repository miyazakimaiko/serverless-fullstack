<template>
  <div>
    <div class="navbar navbar-expand-lg navbar-light bg-white">
      <div class="container-fluid">
        <router-link to="/" class="navbar-brand">タイトル</router-link>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse justify-content-end" id="navbarNav">
          <ul class="navbar-nav">
            <li v-if="isUser" class="nav-item ms-1 me-1">
              <router-link to="/posts" class="nav-link">投稿管理</router-link>
            </li>
            <li v-if="isUser" class="nav-item ms-1 me-1">
              <router-link to="/insta/account" class="nav-link">Instagramアカウント管理</router-link>
            </li>
            <li v-if="isUser" class="nav-item ms-1 me-1">
              <router-link to="/tiktok/account" class="nav-link">TikTokアカウント管理</router-link>
            </li>
            <li v-if="isAdmin" class="nav-item ms-1 me-1">
              <router-link to="/users" class="nav-link">ユーザー管理</router-link>
            </li>
            <li v-if="isAdmin || isUser" class="nav-item ms-1 me-1">
              <router-link to="/change-password" class="nav-link">パスワード変更</router-link>
            </li>
            <li v-if="isAdmin || isUser" class="nav-item ms-1 me-1">
              <button @click="logout" class="btn btn-outline-danger">ログアウト</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="mt-4 mx-auto" style="max-width: 720px;">
      <router-view />
    </div>
  </div>
</template>


<script>
import userPool from '@/user-pool';
import { mapGetters, mapMutations } from 'vuex';

export default {
  components: {
  },
  props: {
    msg: String
  },
  data() {
    return {
    };
  },
  computed: {
    ...mapGetters([
      'isAdmin', 
      'isUser'
    ]),
  },
  methods: {
    ...mapMutations([
      'setUser',
      'clearUser',
    ]),
    loggedIn() {
      this.checkUser();
    },
    logout() {
      const cognitoUser = userPool.getCurrentUser();
      if (cognitoUser) {
        cognitoUser.signOut();
      }
      this.clearUser();
      console.log('ログアウトしました')
      this.$router.push({ path: 'login' });
    },
    checkUser() {
      const cognitoUser = userPool.getCurrentUser();
      if (cognitoUser) {
        cognitoUser.getSession((err, session) => {
          if (err) {
            console.error('セッション取得に失敗しました', err);
            this.clearUser();
            return;
          }
          this.setUser(session);
        });
      } else {
        this.clearUser();
      }
    },
  },
  created() {
    this.checkUser();
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

.form-label {
  font-weight: bold;
}
</style>
