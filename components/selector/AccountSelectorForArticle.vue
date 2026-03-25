<template>
  <USelectMenu
    v-model="selected"
    size="md"
    color="gray"
    searchable
    searchable-placeholder="筛选公众号..."
    clear-search-on-close
    :options="sortedAccountInfos"
    option-attribute="nickname"
    placeholder="请选择公众号"
  >
    <template #label>
      <UAvatar v-if="selected" :src="selected.round_head_img" size="2xs" />
      <span v-if="selected" class="max-w-30 line-clamp-1">{{ selected.nickname }}</span>
      <span v-if="selected" class="shrink-0">({{ selected.articles }}篇)</span>
    </template>
    <template #option="{ option: account }">
      <UAvatar :src="account.round_head_img" size="sm" />
      <div>
        <p class="text-[16px]">{{ account.nickname }}</p>
        <p class="text-gray-500 text-sm">已加载文章数: {{ account.articles }}</p>
      </div>
    </template>
    <template #option-empty="{ query }">
      未找到匹配「{{ query }}」的公众号<br />请先在「<NuxtLink
        to="/dashboard/account"
        class="text-blue-500 hover:underline"
        >公众号管理</NuxtLink
      >」中添加
    </template>
    <template #empty>
      暂无公众号，请先在「<NuxtLink to="/dashboard/account" class="text-blue-500 hover:underline">公众号管理</NuxtLink
      >」中添加
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
import { importMpAccounts } from '~/store/v2/info';
import { getAllInfo, type MpAccount } from '~/store/v2/info';

// 已缓存的公众号信息
const cachedAccountInfos = ref<MpAccount[]>(await getAllInfo());

async function hydrateLocalAccounts() {
  try {
    const response = await $fetch<{
      list: Array<{ fakeid: string; nickname: string; articles: number }>;
    }>('/api/web/local/accounts');

    if (!response?.list?.length) {
      return;
    }

    const existingIds = new Set(cachedAccountInfos.value.map(item => item.fakeid));
    const toImport = response.list
      .filter(item => item.fakeid && !existingIds.has(item.fakeid))
      .map(item => ({
        fakeid: item.fakeid,
        nickname: item.nickname,
        round_head_img: '',
        completed: false,
        count: item.articles,
        articles: item.articles,
        total_count: item.articles,
      }));

    if (toImport.length > 0) {
      await importMpAccounts(toImport);
      cachedAccountInfos.value = await getAllInfo();
    }
  } catch (error) {
    console.warn('hydrate local accounts failed', error);
  }
}

await hydrateLocalAccounts();

const sortedAccountInfos = computed(() => {
  return [...cachedAccountInfos.value].sort((a, b) => {
    return a.articles > b.articles ? -1 : 1;
  });
});

const selected = defineModel<MpAccount | undefined>();
</script>
