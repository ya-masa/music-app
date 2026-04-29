<template>
  <div ref="container" class="form-container">
    <div
      v-for="(item, index) in items"
      :key="index"
      :ref="el => itemRefs[index] = el"
      class="form-item"
      :class="{ highlight: highlightedIndex === index }"
    >
      <label>{{ item.label }}</label>
      <input
        type="text"
        v-model="item.value"
        @change="handleComplete(index)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const items = ref([
  { label: '名前', value: '' },
  { label: 'メール', value: '' },
  { label: '住所', value: '' },
])

const container = ref(null)
const itemRefs = ref([])
const highlightedIndex = ref(null)

const handleComplete = async (index) => {
  highlightedIndex.value = null

  await nextTick()

  const el = itemRefs.value[index]
  const containerEl = container.value

  const containerRect = containerEl.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()

  const offset =
    elRect.top -
    (containerRect.top + containerRect.height / 2 - elRect.height / 2)

  containerEl.scrollTo({
    top: containerEl.scrollTop + offset,
    behavior: 'smooth'
  })

  setTimeout(() => {
    highlightedIndex.value = index

    setTimeout(() => {
      highlightedIndex.value = null
    }, 2000)
  }, 0)
}
</script>