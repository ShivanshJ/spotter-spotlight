import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Home.vue') },
  { path: '/settings', component: () => import('../views/Settings.vue') },
  { path: '/profile', component: () => import('../views/Profile.vue') },
]

export default createRouter({ history: createWebHistory(), routes })
