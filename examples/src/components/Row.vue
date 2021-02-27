<template>
  <div class="virtual-row" style="border-bottom: 1px solid">Row {{index}}</div>
</template>

<script>
export default {
  name: 'Row',
  props: {
    index: {
      type: Number
    },
    rowData: {

    },
  },
}
</script>