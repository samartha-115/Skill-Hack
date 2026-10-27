# Problem 10: Smart Canteen Hub with Live Kitchen KDS, Dietary Tags & Ready Alert

> **Team ByteBite** • Built for Hackathon Day 4  
> Single-Page Canteen App featuring Live Kitchen KDS Kanban, Dietary & Spice Filters, Concurrency-Safe Stock Management, and Native Web Audio / HTML5 Vibration Ready Alerts.

---

## 🚀 Key Features

1. **Client Trust Architecture**:
   - The frontend **never** calculates item prices, totals, or estimated prep times.
   - All financial and scheduling computations are performed strictly on the Node.js / Express backend using MongoDB records.

2. **Concurrency Control & Atomic Inventory**:
   - High concurrency stock deduction using MongoDB atomic `$inc: { availableUnits: -qty }` with condition `{ availableUnits: { $gte: qty } }`.
   - Returns **409 Conflict** (`{ "error": "Only X units of '<Item>' remaining in stock" }`) if stock is insufficient.

3. **Strict Order State Machine**:
   - Status transitions strictly follow: `placed` ➔ `preparing` ➔ `ready` ➔ `collected`.
   - Illegal status jumps or backwards transitions immediately return **HTTP 400 Bad Request**.

4. **Zero-Dependency Ready Alert System**:
   - **HTML5 Device Vibration**: Uses standard `navigator.vibrate([300, 150, 300, 150, 500])`.
   - **Native Web Audio API Chime**: Synthesizes a cheerful two-tone alert chime (523.25Hz -> 659.25Hz) using `window.AudioContext` (no audio files or third-party audio packages required).
   - **Animated Notification Banner**: "🔔 YOUR FOOD IS READY! Token #T-XXX is waiting at the counter!"

5. **Live Kitchen Display System (KDS)**:
   - 3 Kanban columns: *1. Placed / New (Blue)*, *2. Preparing in Kitchen (Amber)*, *3. Ready for Pickup (Green)*.
   - Action buttons to advance tickets through the state machine.
   - Auto-refreshes every 6 seconds to show real-time incoming orders.
   - Top metrics bar powered by MongoDB `.aggregate()`: Today's Revenue, Total Orders, Active Kitchen Queue, and Top Selling Item.

---

## 🛠️ Tech Stack & Constraints

- **Backend**: Node.js, Express (`^4.19.2`)
- **Database**: Native MongoDB Driver (`^6.8.0`) — *Strictly no Mongoose or other ODM*
- **Database URL**: `mongodb://127.0.0.1:27017`
- **Database Name**: `Hack_SmartCanteen`
- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism & CSS Variables), Vanilla JavaScript (No Tailwind, no external frontend frameworks)

---

## 💻 Terminal Commands

### 1. Install Dependencies
```bash
# From workspace root:
npm install

# Or inside team-bytebite:
cd team-bytebite
npm install
```

### 2. Start the Server
```bash
# From root directory:
npm start
# or: node server.js

# Or from inside team-bytebite:
cd team-bytebite
node server.js
```
The server will connect to MongoDB, seed the `menu` collection if empty, and listen at:
👉 **`http://127.0.0.1:3000`**

### 3. Run Dev Server with Auto-Restart
```bash
node --watch team-bytebite/server.js
```

---

## 🍃 MongoDB Shell (`mongosh`) Commands

Open `mongosh` in your terminal to inspect or manipulate the database:

```javascript
// 1. Connect to MongoDB and switch to project database
mongosh
use Hack_SmartCanteen

// 2. View all seeded menu items with dietary tags and stock
db.menu.find({}, { name: 1, amount: 1, availableUnits: 1, prepTime: 1, spiceLevel: 1, dietaryType: 1, category: 1 })

// 3. View only Vegetarian items with spice level <= 3
db.menu.find({ dietaryType: "veg", spiceLevel: { $lte: 3 } })

// 4. Manually restock Masala Dosa (+10 units)
db.menu.updateOne({ name: "Masala Dosa" }, { $inc: { availableUnits: 10 } })

// 5. Inspect the sequential orderToken counter
db.counters.find()

// 6. View all active orders sorted by creation time
db.orders.find({ status: { $in: ["placed", "preparing", "ready"] } }).sort({ createdAt: -1 })

// 7. Test Aggregation Pipeline (Revenue, Order Count, and Active Queue)
db.orders.aggregate([
  {
    $facet: {
      stats: [
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalAmount" },
            totalOrders: { $sum: 1 }
          }
        }
      ],
      active: [
        { $match: { status: { $in: ["placed", "preparing", "ready"] } } },
        { $count: "activeCount" }
      ],
      topSelling: [
        { $unwind: "$items" },
        { $group: { _id: "$items.name", totalSold: { $sum: "$items.qty" } } },
        { $sort: { totalSold: -1 } },
        { $limit: 1 }
      ]
    }
  }
])

// 8. Clear collections to re-trigger automatic seed on startup (Optional)
db.menu.drop()
db.orders.drop()
db.counters.drop()
```

---

## 📡 REST API Specification

All error responses strictly return `{ "error": "Human-readable explanation" }`.

### 1. `GET /menu`
Fetch all menu items.
- **Query Filters**:
  - `?dietaryType=veg|egg|non-veg`
  - `?maxSpice=1..5`
  - `?category=Breakfast|Snacks|Meals|Beverages`
- **Example cURL**:
  ```bash
  curl http://127.0.0.1:3000/menu?dietaryType=veg&maxSpice=3
  ```

### 2. `POST /menu`
Add a new menu item with strict validation.
- **Body**:
  ```json
  {
    "name": "Paneer Kathi Roll",
    "amount": 85,
    "availableUnits": 15,
    "prepTime": 8,
    "spiceLevel": 3,
    "dietaryType": "veg",
    "category": "Snacks"
  }
  ```
- **Example cURL**:
  ```bash
  curl -X POST http://127.0.0.1:3000/menu \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Paneer Kathi Roll\",\"amount\":85,\"availableUnits\":15,\"prepTime\":8,\"spiceLevel\":3,\"dietaryType\":\"veg\",\"category\":\"Snacks\"}"
  ```

### 3. `PATCH /menu/:id/stock`
Add or set `availableUnits` (restock item).
- **Body**: `{ "addUnits": 10 }` or `{ "availableUnits": 25 }`
- **Example cURL**:
  ```bash
  curl -X PATCH http://127.0.0.1:3000/menu/<MENU_ID>/stock \
    -H "Content-Type: application/json" \
    -d "{\"addUnits\": 10}"
  ```

### 4. `POST /orders`
Place an order. Validates stock, calculates totals server-side, atomically decrements inventory, and generates sequential token (e.g., `T-101`).
- **Body**:
  ```json
  {
    "customerName": "Samarth Kamble",
    "usn": "1RV21CS001",
    "items": [
      { "menuId": "<MENU_ID>", "qty": 2 }
    ]
  }
  ```
- **Returns**: `201 Created` with order document, or `409 Conflict` if stock is insufficient.

### 5. `GET /orders`
Fetch all active orders (`placed`, `preparing`, `ready`) sorted by `createdAt` descending.
- **Query**: `?all=true` to retrieve all orders including `collected`.

### 6. `GET /orders/:id`
Fetch single order details for live customer tracker polling.

### 7. `PATCH /orders/:id/status`
Advance order through strict state machine: `placed` -> `preparing` -> `ready` -> `collected`.
- **Body**: `{ "status": "preparing" }`
- **Returns**: `200 OK` on valid transition, `400 Bad Request` on invalid jump or backward move.

### 8. `GET /orders/stats`
Returns live aggregated dashboard metrics:
```json
{
  "totalRevenue": 240,
  "totalOrders": 2,
  "activeOrdersCount": 1,
  "topSellingItem": "Masala Dosa (2 sold)"
}
```

---

## 🧪 Testing Steps & End-to-End Walkthrough

1. **Start the server**:
   Run `npm start` in the terminal. Verify the console logs:
   - `[MongoDB] Connected successfully to mongodb://127.0.0.1:27017`
   - `[Seed] Inserted 7 initial menu items.`
   - `[Server] Smart Canteen Hub running on http://127.0.0.1:3000`

2. **Open the browser**:
   Navigate to `http://127.0.0.1:3000`.

3. **Customer Food Hub & Ordering**:
   - Filter items by clicking **🥦 Veg Only**, or filtering by **Spice Level (🌶️)**.
   - Click **Add to Cart** on items.
   - Open the **Cart Drawer (🛒)**. Enter Customer Name and USN.
   - Click **Place Order & Get Token**.
   - Note the generated Token (e.g. `T-101`) and the live tracker progress bar.

4. **Test Live KDS Kanban & Ready Alert**:
   - Click the **👨‍🍳 Kitchen KDS Board** tab in navigation.
   - Your order appears under **1. Placed / New (Blue)**.
   - Click **🔥 Start Preparing**. Ticket moves to **2. Preparing in Kitchen (Amber)**.
   - Click **🔔 Mark Ready**. Ticket moves to **3. Ready for Pickup (Green)**.
   - Observe the Customer Hub / Live Tracker:
     - The **two-tone chime plays immediately** via Web Audio API.
     - Device **vibrates** (on supported mobile devices).
     - The animated green alert banner displays: `🔔 YOUR FOOD IS READY! Token #T-101 is waiting at the counter!`
   - In KDS, click **✓ Mark Collected** to finish the order lifecycle.

5. **Test Concurrency & Inventory**:
   - Check the **Menu & Restock** tab to view live stock units.
   - If stock reaches 0, the item button automatically displays `Sold Out` and prevents further ordering.
   - Use the **+5 Units** or **+10 Units** restock button to replenish stock in real time.