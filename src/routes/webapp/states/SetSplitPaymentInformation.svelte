<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "$lib/i18n/i18n";

  import StatusTitle from "$lib/components/StatusTitle.svelte";

  import type TelegramBot from "node-telegram-bot-api";
  import { webAppStore, stateStore } from "$lib/webapp/store";
  import FieldText from "$lib/components/FieldText.svelte";
  import { createEventDispatcher } from "svelte";
  import { getNumber, updateBackButton } from "$lib/webapp/utils";
  import { ripple } from "svelte-ripple-action";
  import Selector from "$lib/components/Selector.svelte";

  let group = $stateStore.group as Group;

  const dispatch = createEventDispatcher();

  let description = $stateStore.paymentInformation?.description || "";
  let amount = $stateStore.paymentInformation?.amount.toString() || "";
  let selected = group?.members.findIndex((m) => m.id === ($stateStore.paymentInformation?.from.id || $stateStore.user?.id));
  let receiptItems: ReceiptItem[] | undefined;
  let taxesIncluded = false;

  const params = new URLSearchParams(window.location.search);

  if (window.location.search) {
    const receiptItemsParam = params.get('receiptItems');
    if (receiptItemsParam) {
      try {
        receiptItems = JSON.parse(decodeURIComponent(receiptItemsParam));
        description = params.get('description') || description;
        amount = params.get('amount') || amount;
      } catch (error) {
        console.error("Error processing receipt items:", error);
      }
    }
    taxesIncluded = params.get('taxesIncluded') === 'true';
  }

  updateBackButton();

  const mainClick = () => {
    if (selected >= 0 && selected < group.members.length) setPaymentInformation(group.members[selected]);
    else $webAppStore?.showAlert($_("app.error.payer_empty"));
  };

  function setPaymentInformation(member: TelegramBot.User) {
    let numAmount = getNumber(amount, true);
    description = description.trim();

    if (description.length <= 0) return $webAppStore?.showAlert($_("app.error.description_void"));
    if (isNaN(numAmount)) return $webAppStore?.showAlert($_("app.error.amount_nan"));
    if (numAmount <= 0) return $webAppStore?.showAlert($_("app.error.amount_negative"));

    stateStore.set({
      ...$stateStore,
      paymentInformation: {
        ...$stateStore.paymentInformation,
        description: description.trim(),
        amount: numAmount,
        from: member,
        receiptItems: receiptItems,
        serviceCharge: parseFloat(params.get('serviceCharge') || '0'),
        serviceTax: parseFloat(params.get('serviceTax') || '0'),
        taxesIncluded: taxesIncluded
      },
      phase: $stateStore.paymentInformation?.id ? 3 : 2,
    });

    dispatch("next");
  }

  function deleteTransaction() {
    $webAppStore.showConfirm($_("app.sure"), (sure: boolean) => {
      if (!sure) return;

      stateStore.set({
        ...$stateStore,
        phase: 5,
      });
      dispatch("next");
    });
  }


  // onMount(() => {
  //   $webAppStore?.showAlert("SetSplitPaymentInformation mounted");
  // });
</script>

<StatusTitle title={group.title} icon="fluent-emoji:classical-building" />

<div class="flex flex-col gap-3">
  {#if receiptItems}
    <p class="hint">{$_("app.receipt_items")}</p>
    <div class="bg-second p-3 rounded-lg">
      {#each receiptItems as item}
        <div class="w-full flex justify-between py-2 border-b border-gray-200 last:border-0">
          <div>
            <div class="font-medium text-left">{item.name}</div>
            <div class="text-sm text-gray-600">
              {item.quantity}x {item.unitPrice.toFixed(2)}
            </div>
          </div>
          <div class="font-bold">
            RM{item.totalPrice.toFixed(2)}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="hint">{$_("app.set_description")}</p>
    <FieldText name={$_("description")} bind:value={description} icon="ic:outline-short-text" />

    <p class="hint">{$_("app.set_import")}</p>
    <FieldText name={$_("amount")} type="number" bind:value={amount} icon="tabler:currency" />
  {/if}

  <p class="hint">{$_("app.select_payer")}</p>
  <Selector 
    bind:value={selected} 
    options={group.members.map((m, i) => ({ 
      key: i, 
      text: `${m.first_name} ${m.last_name || ""}`.trim() 
    }))} 
  />

  <button class="mt-3" use:ripple on:click={mainClick}>
    {$_("continue")}
  </button>

  {#if $stateStore.paymentInformation?.id}
    <button class="-mt-1 delete" use:ripple on:click={deleteTransaction}>{$_("delete")}</button>
  {/if}
</div>
