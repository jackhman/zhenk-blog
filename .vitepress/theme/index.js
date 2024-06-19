import Theme from 'vitepress/theme'
import './style.css'
import MyLayout from './Layout.vue'
import Image from './Image.vue'
import 'element-plus/theme-chalk/dark/css-vars.css'
export default {
  extends: Theme,
  Layout: MyLayout,
  enhanceApp({ app, router, siteData }) {
    app.component('Image',Image);
  }
}
