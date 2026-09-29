<template>
  <div class="user-menu">
    <div class="trigger" @click="open = !open">{{ name }}</div>
    <ul v-if="open" class="menu">
      <li @click="go('/profile')">Profile</li>
      <li @click="go('/settings')">Settings</li>
      <li @click="go('/logout')">Log out</li>
    </ul>
  </div>
</template>
<script>
export default {
  props: { name: String },
  data: () => ({ open: false }),
  methods: { go(path) { this.open = false; this.$router.push(path); } },
};
</script>
