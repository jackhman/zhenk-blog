<script setup>

const {src,alt} = defineProps(['src',"alt"])
const srcList = [src]
</script>

<template>
  <div class="demo-image__preview">
    <el-image
        :alt="alt"
        lazy
        :hide-on-click-modal="true"
        :src="src"
        :zoom-rate="1.2"
        :preview-src-list="srcList"
        fit="cover"
    />
  </div>
</template>

<style scoped>
.demo-image__error .image-slot {
  font-size: 30px;
}
.demo-image__error .image-slot .el-icon {
  font-size: 30px;
}
.demo-image__error .el-image {
  width: 100%;
  height: 200px;
}
</style>