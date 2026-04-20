# Store Billing System — Setup Guide

## Files
| File | Purpose |
|------|---------|
| `Code.gs` | Server-side Google Apps Script (data layer) |
| `index.html` | Main HTML shell |
| `appsscript.json` | Apps Script manifest |

---

## Setup Steps

### 1. Create a New Google Apps Script Project
1. Go to [script.google.com](https://script.google.com) → **New project**
2. Rename it to "Store Billing System"

### 2. Add the Files
Copy each file's content into Apps Script:

| Local File | Apps Script File |
|-----------|-----------------|
| `Code.gs` | `Code.gs` (default) |
| `index.html` | New HTML file → name it `index` |


> **To add an HTML file:** click **+** → **HTML** → set the name (without .html extension)

### 3. Configure Manifest
1. Click **Project Settings** (gear icon) → check **Show "appsscript.json" manifest file**
2. Replace the manifest content with `appsscript.json`
3. Change `"timeZone"` to your timezone if needed (e.g., `"America/New_York"`)

### 4. Link to a Google Sheet
1. In Apps Script, click **Resources** → **Advanced Google Services** (or just save — the script auto-uses the bound spreadsheet)
2. **Recommended:** Create a new Google Sheet first, then from the sheet: **Extensions → Apps Script** — this automatically binds the script to that sheet.

### 5. Deploy as Web App
1. Click **Deploy** → **New deployment**
2. Type: **Web app**
3. Execute as: **Me** (or "User deploying")
4. Who has access: **Anyone** (or restrict as needed)
5. Click **Deploy** → copy the web app URL

### 6. First Run
Open the web app URL. On first load:
- Google Sheets tabs are auto-created: `Inventory`, `Bills`, `BillItems`, `Settings`
- Sample inventory items are pre-loaded
- Configure your store details in the **⚙️ Settings** tab

---

## Features

### 🧾 Billing
- Live item search + category filter
- Only in-stock items are clickable (out-of-stock items are greyed out)
- Cart with qty controls + live total calculation (100% client-side)
- Discount % and Tax (GST) % fields
- Payment mode selector: Cash / UPI / Card / Credit
- One-click bill generation → saved to Google Sheet

### 📲 WhatsApp
- After bill generation, click **Send via WhatsApp**
- Auto-formats a detailed bill message
- Opens `wa.me` link with pre-filled message to customer's number
- Falls back to store phone if no customer phone entered

### 📦 Inventory
- Add / Edit / Delete items
- Stock badges: ✓ Green (ok), ⚠ Yellow (≤5), ❌ Red (0)
- Summary stats: Total / In Stock / Low Stock / Out of Stock
- Auto-deducted when bill is saved

### 📋 History
- Last 100 bills shown
- Re-send WhatsApp from history

### ⚙️ Settings
- Store name, phone, address, GSTIN
- Currency symbol, Tax label, default Tax/Discount %
- Bill number prefix

---

## Google Sheet Structure (auto-created)

### Inventory tab
`ItemID | ItemName | Category | Price | Stock | Unit | HSN | ImageURL`

### Bills tab
`BillID | Date | Time | CustomerName | CustomerPhone | SubTotal | DiscountPct | DiscountAmt | TaxPct | TaxAmt | GrandTotal | PaymentMode | WhatsAppSent | Notes`

### BillItems tab
`BillID | ItemID | ItemName | Qty | Unit | Price | LineTotal`

### Settings tab
`Key | Value`

---

## Customization Tips
- **Country code for WhatsApp:** In `app.html`, find `if (ph.length === 10) ph = '91' + ph;` and change `91` to your country code
- **Low stock threshold:** Search for `stock <= 5` in `app.html` and change the value
- **Add more payment modes:** Edit the `.payment-modes` section in `index.html`
