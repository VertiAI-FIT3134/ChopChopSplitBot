import { addSplit } from "$lib/db/interface";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async () => {
  const numberOfSplits = 320;
  const results = [];

  // Sample data
  const sampleGroup = {
    id: -1001234567890,
    title: "Test Group",
    type: "group" as const
  };

  const sampleUsers = [
    { id: 123456789, first_name: "User1", is_bot: false },
    { id: 987654321, first_name: "User2", is_bot: false },
    { id: 456789123, first_name: "User3", is_bot: false }
  ];

  const descriptions = [
    "Lunch", "Dinner", "Coffee", "Groceries", 
    "Movie", "Transport", "Shopping", "Utilities"
  ];

  for (let i = 0; i < numberOfSplits; i++) {
    const amount = Math.floor(Math.random() * 1000) + 10; // Random amount between 10 and 1010
    const splitAmount = amount / sampleUsers.length;

    try {
      const result = await addSplit({
        group: sampleGroup,
        from: sampleUsers[0], // First user is always the payer
        description: descriptions[Math.floor(Math.random() * descriptions.length)],
        amount: amount,
        mode: "equally",
        splits: sampleUsers.map(user => ({
          ...user,
          amount: splitAmount,
          selected: true,
          is_bot: false
        })),
        date: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000) // Random date within last 30 days
      });

      results.push(result);
      
      // Add a small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error("Error adding split:", error);
    }
  }

  return new Response(`Added ${results.length} fake splits`);
}; 