import { createApp } from 'vue';
import store from '@/store';
import MainApp from '@/MainApp.vue';
import mainRouter from '@/mainRouter';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';

const mainApp = createApp(MainApp);
mainApp.use(store);
mainApp.use(mainRouter);
mainApp.mount('#app');
