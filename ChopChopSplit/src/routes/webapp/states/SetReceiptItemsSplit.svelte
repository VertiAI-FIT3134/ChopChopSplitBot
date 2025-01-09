<script lang="ts">
  import { _ } from "$lib/i18n/i18n";
  import StatusTitle from "$lib/components/StatusTitle.svelte";
  import { webAppStore, stateStore } from "$lib/webapp/store";
  import { createEventDispatcher } from "svelte";
  import { ripple } from "svelte-ripple-action";

  let group = $stateStore.group as Group;
  let paymentInformation = $stateStore.paymentInformation as PaymentInformation;
  
  const dispatch = createEventDispatcher();

  let items = paymentInformation.receiptItems?.map(item => ({
    ...item,
    assignedTo: item.assignedTo || []
  })) || [];

  console.log("Payment Information:", paymentInformation);
  console.log("Service Charge:", paymentInformation.serviceCharge);
  console.log("Service Tax:", paymentInformation.serviceTax);
  console.log("Receipt Items:", items);

  function toggleMember(itemIndex: number, memberId: number) {
    const index = items[itemIndex].assignedTo.indexOf(memberId);
    if (index === -1) {
      items[itemIndex].assignedTo.push(memberId);
    } else {
      items[itemIndex].assignedTo.splice(index, 1);
    }
    items = [...items]; // Trigger reactivity
  }

  function mainClick() {
    // Validate that all items are assigned to at least one person
    const unassignedItems = items.filter(item => item.assignedTo.length === 0);
    if (unassignedItems.length > 0) {
      return $webAppStore?.showAlert($_("app.error.items_unassigned"));
    }

    stateStore.set({
      ...$stateStore,
      paymentInformation: {
        ...paymentInformation,
        receiptItems: items
      },
      phase: 3
    });

    dispatch("next");
  }
</script>

<div class="flex flex-col h-screen">
  <!-- Fixed Header -->
  <div class="flex-none">
    <StatusTitle title={group.title} icon="fluent-emoji:classical-building" />
    <StatusTitle 
      title={"RM" + paymentInformation.amount} 
      subtitle={paymentInformation.description || ""} 
      icon="fluent-emoji:money-bag" 
    />
  </div>

  <!-- Scrollable Content -->
  <div class="flex-1 overflow-y-auto px-4 py-3">
    <!-- Split Equally Button -->
    <button
      class="w-full bg-blue-500 text-white mb-2 py-2 rounded-lg transition-all duration-200 hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-blue-500/25"
      use:ripple
      on:click={() => {
        items = items.map(item => ({
          ...item,
          assignedTo: group.members.map(m => m.id)
        }));
      }}>
      Split Equally Among Everyone
    </button>

    <!-- Reset Splits Button -->
    <button
      class="w-full bg-gray-700 text-white mb-5 py-2 rounded-lg transition-all duration-200 hover:bg-gray-600 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-gray-500/25"
      use:ripple
      on:click={() => {
        items = items.map(item => ({
          ...item,
          assignedTo: []
        }));
      }}>
      Reset Splits
    </button>

    <p class="hint mb-3">{$_("app.assign_items")}</p>
    
    <!-- Items List -->
    <div class="flex flex-col gap-3">
      {#each items as item, itemIndex}
        <div class="bg-black p-3 rounded-lg border border-white/20">

        <div class="font-bold">{item.name}</div>
          <div class="flex justify-between items-center">
            <div class="text-md text-gray-300">
             {item.quantity}x {item.unitPrice.toFixed(2)} = RM{item.totalPrice.toFixed(2)}
             {#if item.charges}
               <span class="text-gray-400"> (+{item.charges.toFixed(2)} tax)</span>
             {/if}
          </div>

            <button 
            class="text-md text-white px-3 py-2 rounded transition-all duration-200 hover:bg-gray-700 hover:scale-105"
            on:click={() => {
              const newPrice = prompt("Enter new price:", item.totalPrice.toString());
              if (newPrice && !isNaN(Number(newPrice))) {
                const newTotal = Number(newPrice);
                items[itemIndex] = {
                  ...item,
                  totalPrice: newTotal,
                  originalPrice: newTotal,
                  unitPrice: newTotal / item.quantity // Update unit price based on new total
                };
                items = [...items]; // Trigger reactivity
                
                // Recalculate total amount
                paymentInformation.amount = items.reduce((sum, item) => sum + item.totalPrice, 0) 
                  + (paymentInformation.serviceCharge || 0) 
                  + (paymentInformation.serviceTax || 0);
              }
            }}>
            Edit Price
            </button>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            {#each group.members as member}
              <button
                class="px-3 py-1 rounded-full text-sm transition-all duration-200 {item.assignedTo.includes(member.id) 
                  ? 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-105' 
                  : 'bg-gray-500 hover:bg-gray-600 hover:scale-105'}"
                on:click={() => toggleMember(itemIndex, member.id)}>
                {member.first_name}
              </button>
            {/each}
          </div>
        </div>
      {/each}

      <!-- Service Charges Summary -->
      <div class="bg-black p-3 rounded-lg border border-white/20 mt-4">
        <div class="flex justify-between text-sm">
          <span>Service Charge:</span>
          <span>RM{(paymentInformation.serviceCharge || 0).toFixed(2)}</span>
        </div>
        <div class="flex justify-between text-sm mt-2">
          <span>Service Tax:</span>
          <span>RM{(paymentInformation.serviceTax || 0).toFixed(2)}</span>
        </div>
        <div class="flex justify-between font-bold mt-2">
          <span>Total:</span>
          <span>RM{paymentInformation.amount.toFixed(2)}</span>
        </div>

        <div class="flex gap-2 mt-2">
          <button 
            class="flex-1 text-xs text-white bg-gray-700 px-2 py-1 rounded transition-all duration-200 hover:bg-gray-600 hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-gray-500/25"
            on:click={() => {
              const newCharge = prompt("Enter new service charge:", (paymentInformation.serviceCharge || 0).toString());
              if (newCharge && !isNaN(Number(newCharge))) {
                paymentInformation.serviceCharge = Number(newCharge);
                paymentInformation.amount = items.reduce((sum, item) => sum + item.totalPrice, 0)
                  + (paymentInformation.serviceCharge || 0)
                  + (paymentInformation.serviceTax || 0);
              }
            }}>
            Edit Service Charge
          </button>
          <button 
            class="flex-1 text-xs text-white bg-gray-700 px-2 py-1 rounded transition-all duration-200 hover:bg-gray-600 hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-gray-500/25"
            on:click={() => {
              const newTax = prompt("Enter new service tax:", (paymentInformation.serviceTax || 0).toString());
              if (newTax && !isNaN(Number(newTax))) {
                paymentInformation.serviceTax = Number(newTax);
                paymentInformation.amount = items.reduce((sum, item) => sum + item.totalPrice, 0)
                  + (paymentInformation.serviceCharge || 0)
                  + (paymentInformation.serviceTax || 0);
              }
            }}>
            Edit Service Tax
          </button>
        </div>
      </div>

      {#if paymentInformation.taxesIncluded}
        <div class="text-sm text-blue-400 mb-2 italic">
          * Service charges and taxes are already included in item prices
        </div>
      {/if}
    </div>
  </div>

  <!-- Fixed Footer -->
  <div class="flex-none p-4 mt-0 bg-gradient-to-t from-black to-transparent">
    <button 
      class="w-full py-2 bg-blue-500 rounded-lg transition-all duration-200 hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-blue-500/25"
      use:ripple 
      on:click={mainClick}
    >
      {$_("continue")}
    </button>
  </div>
</div> 