<template>
  <div class="virtual-row" style="border-bottom: 1px solid">Row {{index}} isScrolling: {{isScrolling}} </div>
</template>

<script>
export default {
  name: 'Row',
  props: {
    index: {
      type: Number
    },
    rows: {
      type: Array,
      default: () => ([])
    },
    isScrolling: {
      type: Boolean,
      default: false
    }
  },
}
</script>