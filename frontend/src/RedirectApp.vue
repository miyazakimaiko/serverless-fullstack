<template>
  <div class="mt-4 mx-auto" style="max-width: 720px;">
    <router-view />
  </div>
</template>

<script>
import userPool from '@/user-pool';

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
  methods: {
    checkUser() {
      const cognitoUser = userPool.getCurrentUser();
      if (cognitoUser) {
        cognitoUser.getSession((err, session) => {
          if (err) {
            console.error('セッション取得に失敗しました', err);
            return;
          }
        });
      }
    },
  },
  created() {
    this.checkUser();
  }
}
</script>

<style>
#redirectApp {
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
