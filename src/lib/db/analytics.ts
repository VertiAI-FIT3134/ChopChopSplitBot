import db from "./db";

// Add this function to update existing records
async function migrateExistingSplits() {
  console.log("Starting splits migration...");
  
  try {
    // Update all splits that have receiptItems to isManualSplit: false
    const receiptResult = await db.collection("splits").updateMany(
      { 
        receiptItems: { $exists: true, $ne: [] },
        isManualSplit: { $exists: false }
      },
      { $set: { isManualSplit: false } }
    );

    // Update all other splits to isManualSplit: true
    const manualResult = await db.collection("splits").updateMany(
      { 
        $or: [
          { receiptItems: { $exists: false } },
          { receiptItems: [] }
        ],
        isManualSplit: { $exists: false }
      },
      { $set: { isManualSplit: true } }
    );

    console.log("Migration complete:", {
      receiptSplits: receiptResult.modifiedCount,
      manualSplits: manualResult.modifiedCount
    });
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

export async function getAnalytics() {
  // Run migration first
  await migrateExistingSplits();

  console.log("Starting analytics collection...");

  // Total number of receipt scans (from receipt_scans collection)
  const totalReceipts = await db.collection("receipt_scans").countDocuments();
  console.log("Total receipts:", totalReceipts);

  // Total number of successful scans
  const successfulScans = await db.collection("receipt_scans")
    .countDocuments({ success: true });
  console.log("Successful scans:", successfulScans);

  // Total number of splits with detailed breakdown
  const splitStats = await db.collection("splits").aggregate([
    {
      $facet: {
        "manual": [
          { $match: { isManualSplit: true } },
          { $count: "count" }
        ],
        "receipt": [
          { $match: { isManualSplit: false } },
          { $count: "count" }
        ],
        "total": [
          { $count: "count" }
        ]
      }
    }
  ]).toArray();

  const manualSplits = splitStats[0]?.manual[0]?.count || 0;
  const receiptSplits = splitStats[0]?.receipt[0]?.count || 0;
  const totalSplits = splitStats[0]?.total[0]?.count || 0;

  console.log("Split statistics:", {
    manual: manualSplits,
    receipt: receiptSplits,
    total: totalSplits
  });

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
    manualSplits,
    receiptSplits,
    totalGroups,
    ocrAccuracy: Math.round(ocrAccuracy * 100) / 100,
    processedReceipts: totalProcessed
  };

  console.log("Final analytics results:", results);
  return results;
} 