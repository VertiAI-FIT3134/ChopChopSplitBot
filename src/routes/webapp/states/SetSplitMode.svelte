<script lang="ts">
  import { _ } from "$lib/i18n/i18n";
  import StatusTitle from "$lib/components/StatusTitle.svelte";
  import { stateStore, webAppStore } from "$lib/webapp/store";
  import { createEventDispatcher } from "svelte";
  import { getNumber } from "$lib/webapp/utils";
  import { ripple } from "svelte-ripple-action";

  let group = $stateStore.group as Group;
  let paymentInformation = $stateStore.paymentInformation as PaymentInformation;
  
  const dispatch = createEventDispatcher();
  console.log("SetSplitMode initialized with paymentInformation:", paymentInformation);

  let membersSplit = group.members.map((m) => ({
    ...m,
    selected: false,
    amount: 0
  }));

  function toggleMember(member: typeof membersSplit[0]) {
    member.selected = !member.selected;
    membersSplit = [...membersSplit]; // Trigger reactivity
    console.log("Member toggled:", member);
  }

  function mainClick() {
    // $webAppStore?.showAlert("mainClick started");
    const selectedMembers = membersSplit.filter((m) => m.selected);
    // $webAppStore?.showAlert("Selected members: " + selectedMembers.length);

    if (selectedMembers.length <= 0) {
      return $webAppStore?.showAlert($_("app.error.members_empty"));
    }

    // Calculate equal split amount
    const amount = paymentInformation.amount / selectedMembers.length;
    selectedMembers.forEach((m) => (m.amount = amount));
    // $webAppStore?.showAlert("Split amount: " + amount);

    // $webAppStore?.showAlert("Current item: " + (paymentInformation.currentItem ? "yes" : "no"));
    
    stateStore.set({
      ...$stateStore,
      splitInformation: {
        mode: "equally" as SplitMode,
        splits: membersSplit,
      },
      phase: paymentInformation.currentItem ? 2 : 3
    });
    // $webAppStore?.showAlert("State updated, phase: " + (paymentInformation.currentItem ? 2 : 3));

    dispatch("next");
    // $webAppStore?.showAlert("Next dispatched");
  }
</script>

<StatusTitle title={group.title} icon="fluent-emoji:classical-building" />
<StatusTitle 
  title={"RM " + paymentInformation.amount} 
  subtitle={paymentInformation.description} 
  icon="fluent-emoji:money-bag" 
/>

<div class="flex flex-col gap-3">
  <p class="hint">{$_("app.assign_items")}</p>
  
  <div class="bg-black p-3 rounded-lg">
    <div class="mt-2 flex flex-wrap gap-2">
      {#each membersSplit as member}
        <button
          class="px-3 py-1 rounded-full text-sm {member.selected ? 'bg-blue-500 text-white' : 'bg-gray-500'}"
          on:click={() => toggleMember(member)}
          use:ripple
        >
          {member.first_name}
        </button>
      {/each}
    </div>
  </div>

  <button class="mt-3" use:ripple on:click={mainClick}>
    {$_("save")}
  </button>
</div>
