// ============================================================
//  STORE BILLING SYSTEM — Google Apps Script Backend
//  Sheet tabs required:
//    1. "Inventory"  → A:ItemID | B:ItemName | C:Category | D:Price | E:Stock | F:Unit | G:HSN | H:ImageURL
//    2. "Bills"      → auto-created headers
//    3. "BillItems"  → auto-created headers
//    4. "Settings"   → A:Key | B:Value  (StoreName, Phone, Address, GSTIN, Currency)
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

// ─── Sheet helpers ────────────────────────────────────────
function getSheet(name) {
  let sh = SS.getSheetByName(name);
  if (!sh) {
    sh = SS.insertSheet(name);
  }
  return sh;
}

function ensureHeaders() {
  const inv = getSheet("Inventory");
  if (inv.getLastRow() === 0) {
    inv.appendRow(["ItemID","ItemName","Category","Price","Stock","Unit","HSN","ImageURL"]);
    // Sample data
    const samples = [
      ["ITM001","Rice (1kg)","Grocery",50,100,"kg","1006",""],
      ["ITM002","Sugar (1kg)","Grocery",45,80,"kg","1701",""],
      ["ITM003","Wheat Flour (1kg)","Grocery",40,60,"kg","1101",""],
      ["ITM004","Cooking Oil (1L)","Grocery",130,50,"L","1507",""],
      ["ITM005","Tea (250g)","Beverage",80,40,"pkt","0902",""],
      ["ITM006","Coffee (100g)","Beverage",120,30,"pkt","0901",""],
      ["ITM007","Milk (1L)","Dairy",60,0,"L","0401",""],  // Out of stock example
      ["ITM008","Butter (100g)","Dairy",55,25,"pkt","0405",""],
      ["ITM009","Biscuits","Snacks",20,200,"pkt","1905",""],
      ["ITM010","Chips","Snacks",30,150,"pkt","1905",""],
    ];
    samples.forEach(r => inv.appendRow(r));
  }

  const bills = getSheet("Bills");
  if (bills.getLastRow() === 0) {
    bills.appendRow(["BillID","Date","Time","CustomerName","CustomerPhone","SubTotal","DiscountPct","DiscountAmt","TaxPct","TaxAmt","GrandTotal","PaymentMode","WhatsAppSent","Notes"]);
  }

  const billItems = getSheet("BillItems");
  if (billItems.getLastRow() === 0) {
    billItems.appendRow(["BillID","ItemID","ItemName","Qty","Unit","Price","LineTotal"]);
  }

  const settings = getSheet("Settings");
  if (settings.getLastRow() === 0) {
    settings.appendRow(["Key","Value"]);
    [
      ["StoreName","My Store"],
      ["StorePhone","9999999999"],
      ["StoreAddress","123, Main Street, City - 000000"],
      ["GSTIN","22AAAAA0000A1Z5"],
      ["Currency","₹"],
      ["TaxLabel","GST"],
      ["DefaultTaxPct","0"],
      ["DefaultDiscountPct","0"],
      ["BillPrefix","BILL"],
    ].forEach(r => settings.appendRow(r));
  }
}

// ─── Web App Entry Point ──────────────────────────────────
function doGet() {
  console.log("[doGet] Web app request received");
  ensureHeaders();
  console.log("[doGet] Headers ensured, building HTML...");
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Store Billing System")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  console.log("[include] Including file: " + filename);
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── Data APIs (called via google.script.run) ─────────────

function getSettings() {
  console.log("[getSettings] Called");
  const sh = getSheet("Settings");
  const rows = sh.getDataRange().getValues();
  const obj = {};
  rows.slice(1).forEach(r => { if (r[0]) obj[r[0]] = r[1]; });
  console.log("[getSettings] Returning " + Object.keys(obj).length + " settings");
  return obj;
}

function getInventory() {
  console.log("[getInventory] Called");
  const sh = getSheet("Inventory");
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) {
    console.log("[getInventory] No data rows found");
    return [];
  }
  const headers = rows[0];
  const result = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
  console.log("[getInventory] Returning " + result.length + " items");
  return result;
}

function saveBill(payload) {
  console.log("[saveBill] Called with " + (payload && payload.items ? payload.items.length : 0) + " items");
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    console.log("[saveBill] Lock timeout: " + e.message);
    return { success: false, error: "Server busy, please retry." };
  }

  try {
    ensureHeaders();

    if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
      console.log("[saveBill] Invalid payload — no items");
      return { success: false, error: "No items in bill." };
    }

    const settings = getSettings();
    const prefix   = settings["BillPrefix"] || "BILL";

    const invSh   = getSheet("Inventory");
    const invData = invSh.getDataRange().getValues();
    const invMap  = {};
    for (let r = 1; r < invData.length; r++) {
      invMap[String(invData[r][0])] = {
        Price: Number(invData[r][3]) || 0,
        Stock: Number(invData[r][4]) || 0,
        ItemName: invData[r][1],
        Unit: invData[r][5],
        row: r + 1,
      };
    }

    let subTotal = 0;
    const verifiedItems = [];
    for (const item of payload.items) {
      const inv = invMap[String(item.ItemID)];
      if (!inv) {
        console.log("[saveBill] Item not found: " + item.ItemID);
        return { success: false, error: "Item not found: " + item.ItemID };
      }
      const qty = Math.max(1, Math.floor(Number(item.qty) || 0));
      if (qty > inv.Stock) {
        console.log("[saveBill] Insufficient stock for " + inv.ItemName + ": need " + qty + ", have " + inv.Stock);
        return { success: false, error: inv.ItemName + " — only " + inv.Stock + " in stock." };
      }
      const lineTotal = +(inv.Price * qty).toFixed(2);
      subTotal += lineTotal;
      verifiedItems.push({
        ItemID: String(item.ItemID), ItemName: inv.ItemName,
        qty, Unit: inv.Unit, Price: inv.Price, lineTotal, invRow: inv.row
      });
    }

    const billSh = getSheet("Bills");
    const lastRow = billSh.getLastRow();
    const billNum = lastRow;
    const billID  = prefix + String(billNum).padStart(5, "0");

    const now     = new Date();
    const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy");
    const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");

    const discPct    = Math.max(0, Math.min(100, parseFloat(payload.discount) || 0));
    const discAmt    = +(subTotal * discPct / 100).toFixed(2);
    const taxable    = subTotal - discAmt;
    const taxPct     = Math.max(0, Math.min(100, parseFloat(payload.tax) || 0));
    const taxAmt     = +(taxable * taxPct / 100).toFixed(2);
    const grandTotal = +(taxable + taxAmt).toFixed(2);

    const custName  = String(payload.customer && payload.customer.name  || "Walk-in").substring(0, 200);
    const custPhone = String(payload.customer && payload.customer.phone || "").replace(/[^\d+\- ]/g, "").substring(0, 20);
    const notes     = String(payload.notes || "").substring(0, 500);
    const payMode   = ["Cash","UPI","Card","Credit"].includes(payload.paymentMode) ? payload.paymentMode : "Cash";

    billSh.appendRow([
      billID, dateStr, timeStr,
      custName, custPhone,
      subTotal, discPct, discAmt, taxPct, taxAmt, grandTotal,
      payMode, "No", notes
    ]);
    console.log("[saveBill] Bill header written: " + billID);

    const itemSh = getSheet("BillItems");
    verifiedItems.forEach(item => {
      itemSh.appendRow([billID, item.ItemID, item.ItemName, item.qty, item.Unit, item.Price, item.lineTotal]);
    });
    console.log("[saveBill] " + verifiedItems.length + " bill items written");

    verifiedItems.forEach(item => {
      const currentStock = Number(invSh.getRange(item.invRow, 5).getValue()) || 0;
      invSh.getRange(item.invRow, 5).setValue(Math.max(0, currentStock - item.qty));
    });
    console.log("[saveBill] Inventory deducted. Grand total: " + grandTotal);

    return { success: true, billID, grandTotal, date: dateStr, time: timeStr };
  } catch (e) {
    console.log("[saveBill] ERROR: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function _deductInventory(items) {
  console.log("[_deductInventory] Called with " + items.length + " items");
  const invSh  = getSheet("Inventory");
  const data   = invSh.getDataRange().getValues();
  const idCol  = 0;
  const qtyCol = 4;

  items.forEach(item => {
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][idCol]) === String(item.ItemID)) {
        const newStock = Math.max(0, (data[r][qtyCol] || 0) - item.qty);
        invSh.getRange(r + 1, qtyCol + 1).setValue(newStock);
        data[r][qtyCol] = newStock;
        console.log("[_deductInventory] " + item.ItemID + " stock -> " + newStock);
        break;
      }
    }
  });
}

function getBillHistory(limit) {
  console.log("[getBillHistory] Called, limit=" + (limit || 50));
  const sh   = getSheet("Bills");
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) {
    console.log("[getBillHistory] No bills found");
    return [];
  }
  const headers = rows[0];
  const data = rows.slice(1).reverse().slice(0, limit || 50);
  console.log("[getBillHistory] Returning " + data.length + " bills");
  return data.map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

function getBillItems(billID) {
  console.log("[getBillItems] Called for billID=" + billID);
  const sh   = getSheet("BillItems");
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  const result = rows.slice(1)
    .filter(r => r[0] === billID)
    .map(r => {
      const o = {};
      headers.forEach((h, i) => o[h] = r[i]);
      return o;
    });
  console.log("[getBillItems] Returning " + result.length + " items for " + billID);
  return result;
}

function updateSettings(newSettings) {
  console.log("[updateSettings] Called with keys: " + Object.keys(newSettings).join(", "));
  const sh   = getSheet("Settings");
  const rows = sh.getDataRange().getValues();
  Object.entries(newSettings).forEach(([key, val]) => {
    let found = false;
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][0] === key) {
        sh.getRange(r + 1, 2).setValue(val);
        found = true;
        break;
      }
    }
    if (!found) sh.appendRow([key, val]);
  });
  console.log("[updateSettings] Done");
  return true;
}

function addInventoryItem(item) {
  console.log("[addInventoryItem] Called: " + item.ItemName);
  const sh = getSheet("Inventory");
  const rows = sh.getDataRange().getValues();
  const ids = rows.slice(1).map(r => r[0]).filter(Boolean);
  const maxNum = ids.reduce((m, id) => {
    const n = parseInt(String(id).replace(/\D/g, "")) || 0;
    return Math.max(m, n);
  }, 0);
  const newID = "ITM" + String(maxNum + 1).padStart(3, "0");
  sh.appendRow([newID, item.ItemName, item.Category, item.Price, item.Stock, item.Unit, item.HSN || "", item.ImageURL || ""]);
  console.log("[addInventoryItem] Created " + newID);
  return { success: true, ItemID: newID };
}

function updateInventoryItem(item) {
  console.log("[updateInventoryItem] Called for " + item.ItemID);
  const sh   = getSheet("Inventory");
  const rows = sh.getDataRange().getValues();
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][0]) === String(item.ItemID)) {
      sh.getRange(r + 1, 2, 1, 7).setValues([[
        item.ItemName, item.Category, item.Price,
        item.Stock, item.Unit, item.HSN || "", item.ImageURL || ""
      ]]);
      console.log("[updateInventoryItem] Updated " + item.ItemID);
      return { success: true };
    }
  }
  console.log("[updateInventoryItem] Not found: " + item.ItemID);
  return { success: false, error: "Item not found" };
}

function deleteInventoryItem(itemID) {
  console.log("[deleteInventoryItem] Called for " + itemID);
  const sh   = getSheet("Inventory");
  const rows = sh.getDataRange().getValues();
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][0]) === String(itemID)) {
      sh.deleteRow(r + 1);
      console.log("[deleteInventoryItem] Deleted " + itemID);
      return { success: true };
    }
  }
  console.log("[deleteInventoryItem] Not found: " + itemID);
  return { success: false, error: "Item not found" };
}
