import { createApp } from 'vue';
import RedirectApp from '@/RedirectApp.vue';
import redirectRouter from '@/redirectRouter';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';

const redirectApp = createApp(RedirectApp);
redirectApp.use(redirectRouter);
redirectApp.mount('#redirectApp');