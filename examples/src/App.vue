<template>
  <img alt="Vue logo" src="./assets/logo.png" />
    <VariableSizeList
      :height="150"
      :item-size="getItemSize"
      :item-count="1000"
      :item-data="[]"
    >
      <template #default="{ data, index, key, isScrolling  }">
        <Row
          :key="key"
          :index="index"
          :rows="data"
          :isScrolling="isScrolling"
          @click="handleClickRow(data, index)"
        />
      </template>
    </VariableSizeList>
</template>

<script>
import { VariableSizeList } from 'vue3-virtualized'
import Row from './components/Row.vue'


const rowHeights = new Array(1000).fill(true).map(() => 25 + Math.round(Math.random() * 50));
const getItemSize = index => rowHeights[index];

export default {
  name: 'App',
  components: {
    VariableSizeList,
    Row,
  },
  data() {
    return {
      rowHeights,
      getItemSize,
    }
  },
  methods: {
    handleClickRow(rows, index) {
      console.log(`click row ${index}`)
    }
  }

}

</script>
