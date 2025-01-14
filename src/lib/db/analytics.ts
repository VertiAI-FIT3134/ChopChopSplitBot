import db from "./db";

export async function getAnalytics() {
  console.log("Starting analytics collection...");

  // Total number of receipt scans (from receipt_scans collection)
  const totalReceipts = await db.collection("receipt_scans").countDocuments();
  console.log("Total receipts:", totalReceipts);

  // Total number of successful scans
  const successfulScans = await db.collection("receipt_scans")
    .countDocuments({ success: true });
  console.log("Successful scans:", successfulScans);

  // Total number of splits (all transactions)
  const totalSplits = await db.collection("splits").countDocuments();
  console.log("Total splits:", totalSplits);

  // Number of groups
  const totalGroups = await db.collection("groups").countDocuments();
  console.log("Total groups:", totalGroups);

  // OCR Accuracy Analysis
  const receipts = await db.collection("receipt_scans")
    .find({ 
      success: true,
      'summary.total': { $exists: true },
      'summary.subtotal': { $exists: true }
    }).toArray();

  let accurateReceipts = 0;
  let totalProcessed = 0;

  receipts.forEach(receipt => {
    if (!receipt.summary) return;

    const { total, subtotal, serviceCharge = 0, serviceTax = 0 } = receipt.summary;
    
    // Skip if we don't have valid numbers
    if (!total || !subtotal) return;

    totalProcessed++;
    const calculatedTotal = subtotal + serviceCharge + serviceTax;
    
    // Consider it accurate if within 1% margin
    if (Math.abs(calculatedTotal - total) / total < 0.01) {
      accurateReceipts++;
    }
  });

  const ocrAccuracy = totalProcessed > 0 ? (accurateReceipts / totalProcessed) * 100 : 0;

  const results = {
    totalReceipts,
    successfulScans,
    totalSplits,
    totalGroups,
    ocrAccuracy: Math.round(ocrAccuracy * 100) / 100,
    processedReceipts: totalProcessed
  };

  console.log("Final analytics results:", results);
  return results;
} 