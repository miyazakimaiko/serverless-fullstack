import { createStore } from 'vuex';

export default createStore({
  state: {
    sessionUser: '',
  },
  mutations: {
    setUser(state, user) {
      state.sessionUser = user;
    },
    clearUser(state) {
      state.sessionUser = null;
    },
  },
  getters: {
    sessionUser: state => state.sessionUser,
    isAdmin: state => {
      const roles = 
        state.sessionUser?.idToken?.payload['cognito:groups'] 
        || state.sessionUser?.accessToken?.payload['cognito:groups'];

      return roles?.includes('Admin');
    },
    isUser: state => {
      const roles = 
        state.sessionUser?.idToken?.payload['cognito:groups'] 
        || state.sessionUser?.accessToken?.payload['cognito:groups'];

      return roles?.includes('User');
    }
  }
});