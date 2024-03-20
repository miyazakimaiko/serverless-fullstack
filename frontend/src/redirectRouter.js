import { createRouter, createWebHistory } from 'vue-router';
import NotFound from '@/views/NotFound.vue';
import TikTokRedirect from '@/views/TikTokRedirect.vue';


const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/tiktok-redirect',
      component: TikTokRedirect,
      meta: {
        requiresAuth: true, 
      },
    },
    {
      path: '/404',
      component: NotFound,
    },
  ]
});

export default router;
