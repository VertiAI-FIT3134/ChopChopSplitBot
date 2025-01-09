<script lang="ts">
  import { fade } from "svelte/transition";

  import { stateStore, webAppStore } from "$lib/webapp/store";
  import SetSplitPaymentInformation from "../states/SetSplitPaymentInformation.svelte";
  import SelectGroup from "../states/SelectGroup.svelte";
  import { fadeOptions, updateBackButton } from "$lib/webapp/utils";
  import SetSplitMode from "../states/SetSplitMode.svelte";
  import Sending from "../states/Sending.svelte";
  import SetReceiptItemsSplit from "../states/SetReceiptItemsSplit.svelte";

  updateBackButton();
</script>

{#if $stateStore.phase === 0}
  <div in:fade={fadeOptions}>
    <SelectGroup on:next={updateBackButton} />
  </div>
{:else if $stateStore.phase === 1}
  <div in:fade={fadeOptions}>
    <SetSplitPaymentInformation on:next={updateBackButton} />
  </div>
{:else if $stateStore.phase === 2 && $stateStore.paymentInformation?.currentItem}
  <div in:fade={fadeOptions}>
    <SetSplitMode 
      on:next={() => {
        // $webAppStore?.showAlert("Handler started");
        
        if (!$stateStore.paymentInformation || !$stateStore.splitInformation || 
            !$stateStore.paymentInformation.currentItem || !$stateStore.paymentInformation.receiptItems) {
          // $webAppStore?.showAlert("Missing required data");
          return;
        }
        
        const currentItem = $stateStore.paymentInformation.currentItem;
        const splits = $stateStore.splitInformation.splits;
        
        // Update the assignedTo for the current item
        const updatedItems = $stateStore.paymentInformation.receiptItems.map(item => 
          item.name === currentItem.name ? 
          { ...item, assignedTo: splits.filter(s => s.selected).map(s => s.id) } : 
          item
        );
        
        // $webAppStore?.showAlert("Items updated");
        
        // Go back to receipt items list
        stateStore.set({
          ...$stateStore,
          paymentInformation: {
            ...$stateStore.paymentInformation,
            receiptItems: updatedItems,
            currentItem: undefined
          },
          phase: 1
        });
        // $webAppStore?.showAlert("Returning to phase 1");
        
        updateBackButton();
      }} 
    />
  </div>
{:else if $stateStore.phase === 2 && $stateStore.paymentInformation?.receiptItems}
  <div in:fade={fadeOptions}>
    <SetReceiptItemsSplit on:next={updateBackButton} />
  </div>
{:else if $stateStore.phase === 2}
  <div in:fade={fadeOptions}>
    <SetSplitMode on:next={updateBackButton} />
  </div>
{:else if $stateStore.phase === 3}
  <div in:fade={fadeOptions}>
    <Sending type="add-split" />
  </div>
{/if}
