<script setup>
import ConfettiGenerator from "confetti-js";
import {onMounted,onUnmounted} from 'vue'


onMounted(() => {
  const confettiElement = document.getElementById('confetti-holder');
  const confettiSettings = {
    "target": confettiElement,
    "max": "40",
    "size": "1.5",
    "animate": true,
    "props": ["circle", "square", "triangle"],
    "colors": [[165, 104, 246], [230, 61, 135], [0, 199, 228], [253, 214, 126]],
    "clock": "15",
    "rotate": true,
    "start_from_edge": false,
    "respawn": true
  };

  const animal = document.getElementById('animal');
  const animalSettings = {
    "target": animal,
    "max": "5",
    "size": "1",
    "animate": true,
    "props": [{
      "type": "svg",
      "src": "/confettiWidget/panda.png",
      "size": 40,
      "weight": .2
    },{
      "type": "svg",
      "src": "/confettiWidget/love-birds.png",
      "size": 40,
      "weight": .1
    },{
      "type": "svg",
      "src": "/confettiWidget/octopus.png",
      "size": 40,
      "weight": .1
    }],
    "colors": [[165, 104, 246], [230, 61, 135], [0, 199, 228], [253, 214, 126]],
    "clock": "10",
    "rotate": false,
    "start_from_edge": false,
    "respawn": true
  };

  let updateSize;
  window.addEventListener("resize",()=>{
    clearTimeout(updateSize)
    updateSize = setTimeout(() => {
      confettiElement.width = document.body.clientWidth
      confettiElement.height = document.body.clientHeight
      confettiElement.getContext('2d').clearRect(0, 0, confetti.width, confetti.height)
      animal.width = document.body.clientWidth
      animal.height = document.body.clientHeight
    }, 200)
  })
  const confetti = new ConfettiGenerator(confettiSettings);
  const animalConfetti = new ConfettiGenerator(animalSettings);
  confetti.render();
  animalConfetti.render();

})

</script>

<template>
  <canvas id="confetti-holder" class="abs confetti">浏览器不支持canvas</canvas>
  <canvas id="animal" class="abs animal">浏览器不支持canvas</canvas>
</template>

<style scoped>
.abs{
  position: absolute;
}
.animal{
  z-index: -5
}
.confetti{
  z-index: -6
}
</style>