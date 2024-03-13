import { createRouter, createWebHistory } from 'vue-router';
import store from '@/store';
import userPool from '@/user-pool';
import Login from '@/views/Login.vue';
import UserRegistration from '@/views/UserRegistration.vue';
import UserManagement from '@/views/UserManagement.vue';
import PostManagement from '@/views/PostManagement.vue';
import PasswordChange from '@/views/PasswordChange.vue';
import TikTokAccountManagement from '@/views/TikTokAccountManagement.vue';
import TikTokRedirect from '@/views/TikTokRedirect.vue';
import NotFound from '@/views/NotFound.vue';

const redirectBasedOnuserRoles = (callback) => {
  if (store.getters.isAdmin) {
    callback('/user-management');
  } else if (store.getters.isUser) {
    callback('/post-management');
  } else {
    callback();
  }
}

const redirectTo404IfNotAdminRole = (callback) => {
  if (store.getters.isAdmin) {
    callback();
  } else {
    callback('404');
  }
}

const redirectTo404IfNotuserRoles = (callback) => {
  if (store.getters.isUser) {
    callback();
  } else {
    callback('404');
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: Login,
      beforeEnter: (to, from, next) => {
        redirectBasedOnuserRoles(next);
      }
    },
    {
      path: '/login',
      component: Login,
      beforeEnter: (to, from, next) => {
        redirectBasedOnuserRoles(next);
      }
    },
    {
      path: '/register',
      component: UserRegistration,
      beforeEnter: (to, from, next) => {
        redirectBasedOnuserRoles(next);
      }
    },
    {
      path: '/change-password',
      component: PasswordChange,
      meta: { 
        requiresAuth: true, 
      },
    },
    {
      path: '/user-management',
      component: UserManagement,
      meta: { 
        requiresAuth: true, 
      },
      beforeEnter: (to, from, next) => {
        redirectTo404IfNotAdminRole(next);
      }
    },
    {
      path: '/post-management',
      component: PostManagement,
      meta: { 
        requiresAuth: true, 
      },
      beforeEnter: (to, from, next) => {
        redirectTo404IfNotuserRoles(next)
      }
    },
    {
      path: '/tiktok/account-management',
      component: TikTokAccountManagement,
      meta: {
        requiresAuth: true, 
      },
      beforeEnter: (to, from, next) => {
        redirectTo404IfNotuserRoles(next)
      }
    },
    {
      path: '/tiktok/redirect',
      component: TikTokRedirect,
      meta: {
        requiresAuth: true, 
      },
      beforeEnter: (to, from, next) => {
        redirectTo404IfNotuserRoles(next)
      }
    },
    {
      path: '/404',
      component: NotFound,
    },
  ]
});

router.beforeEach((to, from, next) => {
  if (to.matched.some(record => record.meta.requiresAuth)) {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      store.commit('clearUser');
      next('login');
    }
    currentUser.getSession((err, session) => {
      if (err) {
        store.commit('clearUser');
        next('login');
      } else {
        store.commit('setUser', session);
        next();
      }
    });
  } else {
    next();
  }
});

export default router;
