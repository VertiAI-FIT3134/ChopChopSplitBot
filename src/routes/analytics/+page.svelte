<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";

  let analytics = {
    totalReceipts: 0,
    successfulScans: 0,
    totalSplits: 0,
    manualSplits: 0,
    receiptSplits: 0,
    totalGroups: 0,
    ocrAccuracy: 0,
    processedReceipts: 0
  };

  let loading = true;

  onMount(async () => {
    try {
      const response = await fetch('/api/analytics');
      analytics = await response.json();
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      loading = false;
    }
  });
</script>

<div class="max-w-4xl mx-auto p-8">
  <h1 class="text-4xl font-bold mb-8">ChopChopSplit Analytics</h1>

  {#if loading}
    <div class="text-center">Loading analytics...</div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Receipt Scans -->
      <div class="bg-blue-500 text-white rounded-lg p-6">
        <div class="flex items-center gap-3 mb-3">
          <Icon icon="fluent-emoji:receipt" class="text-4xl" />
          <div>
            <h2 class="text-2xl font-bold">{analytics.totalReceipts}</h2>
            <p class="text-blue-100">Receipt Scans</p>
            <p class="text-sm text-blue-200">
              {analytics.successfulScans} successful ({Math.round(analytics.successfulScans/analytics.totalReceipts * 100)}%)
            </p>
          </div>
        </div>
        <p class="text-xs text-blue-200 border-t border-blue-400 pt-2">
          Total attempts to scan receipts, including both successful and failed scans. Success rate indicates reliable image captures.
        </p>
      </div>

      <!-- Total Splits -->
      <div class="bg-green-500 text-white rounded-lg p-6">
        <div class="flex items-center gap-3 mb-3">
          <Icon icon="fluent-emoji:money-bag" class="text-4xl" />
          <div>
            <h2 class="text-2xl font-bold">{analytics.totalSplits}</h2>
            <p class="text-green-100">Total Splits</p>
            <p class="text-sm text-green-200">
              {analytics.manualSplits} manual · {analytics.receiptSplits} from receipts
            </p>
          </div>
        </div>
        <p class="text-xs text-green-200 border-t border-green-400 pt-2">
          Total expense splits created. Manual splits are entered directly, while receipt splits are generated from scanned receipts.
        </p>
      </div>

      <!-- Active Groups -->
      <div class="bg-purple-500 text-white rounded-lg p-6">
        <div class="flex items-center gap-3 mb-3">
          <Icon icon="fluent-emoji:classical-building" class="text-4xl" />
          <div>
            <h2 class="text-2xl font-bold">{analytics.totalGroups}</h2>
            <p class="text-purple-100">Active Groups</p>
          </div>
        </div>
        <p class="text-xs text-purple-200 border-t border-purple-400 pt-2">
          Number of Telegram groups where the bot has been added and used for expense splitting.
        </p>
      </div>

      <!-- OCR Accuracy -->
      <div class="bg-orange-500 text-white rounded-lg p-6">
        <div class="flex items-center gap-3 mb-3">
          <Icon icon="fluent-emoji:bullseye" class="text-4xl" />
          <div>
            <h2 class="text-2xl font-bold">{analytics.ocrAccuracy}%</h2>
            <p class="text-orange-100">OCR Accuracy</p>
            <p class="text-sm text-orange-200">Based on {analytics.processedReceipts} receipts</p>
          </div>
        </div>
        <p class="text-xs text-orange-200 border-t border-orange-400 pt-2">
          Accuracy of receipt scanning. A scan is considered accurate when the calculated total (items + charges) matches the printed total within 1% margin.
        </p>
      </div>
    </div>
  {/if}
</div> 