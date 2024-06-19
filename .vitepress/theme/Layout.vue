<script setup lang="ts">
import { useRouter,useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import {ref,watch,onMounted,onBeforeUnmount, } from 'vue'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

import Url from 'url-parse'

const route = useRoute()
const router = useRouter();
const title = ref('');

const dialogVisible = ref(false)
const externalLink = ref("")
function confirm(){
  dialogVisible.value = false
  window.open(externalLink.value,"_blank");
}

function changeTitle(){
  const routeSplit = route.data.relativePath.split("/");
  if (routeSplit.length>=2){
    let t = routeSplit[routeSplit.length-2].replace(/\s+/g,"")
    const patten = /[0-9]*(-|_)/
    const regExp = patten.exec(t);
    if (regExp!=null) title.value = t.replace(regExp[0],"").replace("文档","")
  }
}
watch(route,changeTitle,{immediate:true})

function t(e){
  e.preventDefault();
  if (Url(document.URL).hostname !== Url(e.target.href).hostname){
    // 已经在提醒页面 仍然点击A标签
    if (Url(document.URL).pathname==="/externalLinks"){
      window.open(e.target.href,"_self");
      return true
    }else {
      externalLink.value = e.target.href
      dialogVisible.value = true
      return false;
    }
  }
}
function preventAClick(){
  let aTags = document.querySelectorAll(".content a");
  aTags.forEach((a)=>{
    a.addEventListener("click", t, true)
  })
}

function removeClickListener() {
  let aTags = document.querySelectorAll(".content a");
  aTags.forEach((a)=>{
    a.removeEventListener("click",t)
  })
}

let width = ref('360')
onMounted(()=>{
  preventAClick()
  window.onpopstate = ()=>{
    setTimeout(preventAClick,500)
  }
  window.onresize = function (){
    width.value = document.body.clientWidth >= 1100 ? '30%' : '80%'
  }
  width.value = document.body.clientWidth >= 1100 ? '30%' : '80%'
})

onBeforeUnmount(()=>{
  removeClickListener()
})


NProgress.configure({ showSpinner: true }); // 显示右上角螺旋加载提示
router.onBeforeRouteChange=(to)=>{
  removeClickListener()
  NProgress.start();
  return true;
}
router.onAfterRouteChanged=(to)=>{
  NProgress.done();
  preventAClick()
}

</script>

<template>
  <DefaultTheme.Layout>
    <template #sidebar-nav-before>
      <div class="title" style="padding: 20px 0px 0px 0px">
        <strong>{{ title }}</strong>
      </div>
    </template>
  </DefaultTheme.Layout>

  <ClientOnly>
    <el-dialog
        v-model="dialogVisible"
        title="提醒"
        :width="width"
    >
      <p>您即将离开Docs,前往:  <el-text class="mx-1" type="warning">{{externalLink}}</el-text></p>
      <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirm">
          确定
        </el-button>
      </span>
      </template>
    </el-dialog>
  </ClientOnly>

</template>
