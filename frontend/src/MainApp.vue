<template>
  <div>
    <div class="navbar navbar-expand-lg navbar-light bg-white">
      <div class="container-fluid">
        <router-link to="/" class="navbar-brand" @click="closeMenu">タイトル</router-link>
        <button class="navbar-toggler" type="button" @click="toggleMenu" :aria-expanded="isMenuOpen.toString()" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse justify-content-end" :class="{ 'show': isMenuOpen }" id="navbarNav">
          <ul class="navbar-nav">
            <li v-if="!isUser && !isAdmin" class="nav-item ms-1 me-1">
              <router-link to="/register" class="nav-link" @click="closeMenu">新規登録</router-link>
            </li>
            <li v-if="!isUser && !isAdmin" class="nav-item ms-1 me-1">
              <router-link to="/login" class="nav-link" @click="closeMenu">ログイン</router-link>
            </li>
            <li v-if="isUser" class="nav-item ms-1 me-1">
              <router-link to="/posts" class="nav-link" @click="closeMenu">投稿管理</router-link>
            </li>
            <li v-if="isUser" class="nav-item ms-1 me-1">
              <router-link to="/insta/account" class="nav-link" @click="closeMenu">Instagramアカウント管理</router-link>
            </li>
            <li v-if="isUser" class="nav-item ms-1 me-1">
              <router-link to="/tiktok/account" class="nav-link" @click="closeMenu">TikTokアカウント管理</router-link>
            </li>
            <li v-if="isAdmin" class="nav-item ms-1 me-1">
              <router-link to="/users" class="nav-link" @click="closeMenu">ユーザー管理</router-link>
            </li>
            <li v-if="isAdmin || isUser" class="nav-item ms-1 me-1">
              <router-link to="/change-password" class="nav-link" @click="closeMenu">パスワード変更</router-link>
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
      isMenuOpen: false
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
    toggleMenu() {
      this.isMenuOpen = !this.isMenuOpen;
    },
    closeMenu() {
      this.isMenuOpen = false;
    },
    loggedIn() {
      this.checkUser();
    },
    logout() {
      this.closeMenu();

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
