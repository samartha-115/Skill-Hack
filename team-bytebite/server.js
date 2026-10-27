const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'Hack_SmartCanteen';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;
let client;

// Helper: Validate 24-character hexadecimal ObjectId
function isValidObjectId(id) {
  if (typeof id !== 'string' || id.length !== 24) {
    return false;
  }
  return /^[0-9a-fA-F]{24}$/.test(id) && ObjectId.isValid(id);
}

// Initial Menu Seed Data
const initialMenuItems = [
  {
    name: "Masala Dosa",
    amount: 60,
    availableUnits: 20,
    prepTime: 8,
    spiceLevel: 2,
    dietaryType: "veg",
    category: "Breakfast"
  },
  {
    name: "Veg Samosa (2 pcs)",
    amount: 25,
    availableUnits: 15,
    prepTime: 3,
    spiceLevel: 3,
    dietaryType: "veg",
    category: "Snacks"
  },
  {
    name: "Egg Bhurji Roll",
    amount: 55,
    availableUnits: 18,
    prepTime: 6,
    spiceLevel: 3,
    dietaryType: "egg",
    category: "Snacks"
  },
  {
    name: "Crispy Chicken Roll",
    amount: 95,
    availableUnits: 14,
    prepTime: 10,
    spiceLevel: 4,
    dietaryType: "non-veg",
    category: "Snacks"
  },
  {
    name: "Spicy Hyderabadi Mutton Biryani",
    amount: 160,
    availableUnits: 8,
    prepTime: 15,
    spiceLevel: 5,
    dietaryType: "non-veg",
    category: "Meals"
  },
  {
    name: "Paneer Butter Masala Meal",
    amount: 120,
    availableUnits: 10,
    prepTime: 12,
    spiceLevel: 2,
    dietaryType: "veg",
    category: "Meals"
  },
  {
    name: "South Indian Filter Coffee",
    amount: 20,
    availableUnits: 30,
    prepTime: 3,
    spiceLevel: 1,
    dietaryType: "veg",
    category: "Beverages"
  }
];

// Seed Database if Empty
async function seedDatabase() {
  const menuCollection = db.collection('menu');
  const count = await menuCollection.countDocuments();
  if (count === 0) {
    await menuCollection.insertMany(initialMenuItems);
    console.log(`[Seed] Inserted ${initialMenuItems.length} initial menu items.`);
  }

  // Ensure counters collection has orderToken initialized
  const countersCollection = db.collection('counters');
  const existingCounter = await countersCollection.findOne({ _id: 'orderToken' });
  if (!existingCounter) {
    const ordersCount = await db.collection('orders').countDocuments();
    await countersCollection.insertOne({ _id: 'orderToken', seq: 100 + ordersCount });
    console.log(`[Seed] Initialized order token counter to ${100 + ordersCount}`);
  }
}

// Generate next sequential token (e.g. "T-101")
async function getNextToken() {
  const countersCollection = db.collection('counters');
  const result = await countersCollection.findOneAndUpdate(
    { _id: 'orderToken' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = (result && result.seq) ? result.seq : 101;
  return `T-${seq}`;
}

// ============================================================================
// REST API ROUTES
// ============================================================================

// 1. GET /menu - Fetch all menu items with optional filters
app.get('/menu', async (req, res) => {
  try {
    const { dietaryType, maxSpice, category } = req.query;
    const filter = {};

    if (dietaryType) {
      if (!['veg', 'egg', 'non-veg'].includes(dietaryType)) {
        return res.status(400).json({ error: "Invalid dietaryType filter. Must be 'veg', 'egg', or 'non-veg'." });
      }
      filter.dietaryType = dietaryType;
    }

    if (maxSpice !== undefined) {
      const spice = parseInt(maxSpice, 10);
      if (isNaN(spice) || spice < 1 || spice > 5) {
        return res.status(400).json({ error: "Invalid maxSpice filter. Must be an integer between 1 and 5." });
      }
      filter.spiceLevel = { $lte: spice };
    }

    if (category) {
      filter.category = category;
    }

    const items = await db.collection('menu').find(filter).toArray();
    return res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching menu:', err);
    return res.status(500).json({ error: "Internal server error while fetching menu." });
  }
});

// 2. POST /menu - Add new menu item with strict validation
app.post('/menu', async (req, res) => {
  try {
    const { name, amount, availableUnits, prepTime, spiceLevel, dietaryType, category } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: "Item name is required and must be a non-empty string." });
    }

    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number greater than 0." });
    }

    if (typeof availableUnits !== 'number' || !Number.isInteger(availableUnits) || availableUnits < 0) {
      return res.status(400).json({ error: "Available units must be an integer greater than or equal to 0." });
    }

    if (typeof prepTime !== 'number' || isNaN(prepTime) || prepTime <= 0) {
      return res.status(400).json({ error: "Prep time must be a number greater than 0." });
    }

    if (typeof spiceLevel !== 'number' || !Number.isInteger(spiceLevel) || spiceLevel < 1 || spiceLevel > 5) {
      return res.status(400).json({ error: "Spice level must be an integer between 1 and 5." });
    }

    if (!['veg', 'egg', 'non-veg'].includes(dietaryType)) {
      return res.status(400).json({ error: "Dietary type must strictly be 'veg', 'egg', or 'non-veg'." });
    }

    const itemCategory = (category && typeof category === 'string' && category.trim().length > 0)
      ? category.trim()
      : 'Meals';

    const newItem = {
      name: name.trim(),
      amount,
      availableUnits,
      prepTime,
      spiceLevel,
      dietaryType,
      category: itemCategory
    };

    const insertResult = await db.collection('menu').insertOne(newItem);
    const createdItem = await db.collection('menu').findOne({ _id: insertResult.insertedId });
    return res.status(201).json(createdItem);
  } catch (err) {
    console.error('Error adding menu item:', err);
    return res.status(500).json({ error: "Internal server error while creating menu item." });
  }
});

// 3. PATCH /menu/:id/stock - Add or set availableUnits
app.patch('/menu/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid menu item ID. Must be a 24-character hexadecimal string." });
    }

    const { availableUnits, addUnits } = req.body;

    const existingItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
    if (!existingItem) {
      return res.status(404).json({ error: "Menu item not found." });
    }

    let updateDoc;
    if (availableUnits !== undefined) {
      if (typeof availableUnits !== 'number' || !Number.isInteger(availableUnits) || availableUnits < 0) {
        return res.status(400).json({ error: "availableUnits must be an integer greater than or equal to 0." });
      }
      updateDoc = { $set: { availableUnits } };
    } else if (addUnits !== undefined) {
      if (typeof addUnits !== 'number' || !Number.isInteger(addUnits)) {
        return res.status(400).json({ error: "addUnits must be an integer." });
      }
      if (existingItem.availableUnits + addUnits < 0) {
        return res.status(400).json({ error: "Resulting availableUnits cannot be negative." });
      }
      updateDoc = { $inc: { availableUnits: addUnits } };
    } else {
      return res.status(400).json({ error: "Please provide either 'availableUnits' or 'addUnits'." });
    }

    const result = await db.collection('menu').findOneAndUpdate(
      { _id: new ObjectId(id) },
      updateDoc,
      { returnDocument: 'after' }
    );

    return res.status(200).json({
      message: "Stock updated successfully",
      item: result
    });
  } catch (err) {
    console.error('Error updating stock:', err);
    return res.status(500).json({ error: "Internal server error while updating stock." });
  }
});

// 4. POST /orders - Place an order with atomic stock decrement & server-calculated totals
app.post('/orders', async (req, res) => {
  try {
    const { customerName, usn, items } = req.body;

    if (!customerName || typeof customerName !== 'string' || customerName.trim().length === 0) {
      return res.status(400).json({ error: "Customer name is required and cannot be empty." });
    }

    if (!usn || typeof usn !== 'string' || usn.trim().length === 0) {
      return res.status(400).json({ error: "USN is required and cannot be empty." });
    }

    const formattedUsn = usn.trim().toUpperCase();

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Order must contain a non-empty array of items." });
    }

    // Validate item inputs
    for (const item of items) {
      if (!item || !item.menuId || !isValidObjectId(item.menuId)) {
        return res.status(400).json({ error: "Each item must have a valid 24-character hexadecimal menuId." });
      }
      if (typeof item.qty !== 'number' || !Number.isInteger(item.qty) || item.qty <= 0) {
        return res.status(400).json({ error: "Item quantity must be an integer greater than 0." });
      }
    }

    // Query menu for all requested items
    const menuIds = items.map(item => new ObjectId(item.menuId));
    const menuDocs = await db.collection('menu').find({ _id: { $in: menuIds } }).toArray();

    if (menuDocs.length !== items.length) {
      return res.status(404).json({ error: "One or more requested menu items could not be found." });
    }

    const menuMap = new Map();
    menuDocs.forEach(doc => menuMap.set(doc._id.toString(), doc));

    // Verify stock availability
    for (const item of items) {
      const menuDoc = menuMap.get(item.menuId);
      if (menuDoc.availableUnits < item.qty) {
        return res.status(409).json({
          error: `Only ${menuDoc.availableUnits} units of '${menuDoc.name}' remaining in stock`
        });
      }
    }

    // Atomically decrement availableUnits
    const decrementedItems = [];
    for (const item of items) {
      const result = await db.collection('menu').updateOne(
        { _id: new ObjectId(item.menuId), availableUnits: { $gte: item.qty } },
        { $inc: { availableUnits: -item.qty } }
      );

      if (result.modifiedCount === 0) {
        // Rollback already decremented items
        for (const dec of decrementedItems) {
          await db.collection('menu').updateOne(
            { _id: dec.id },
            { $inc: { availableUnits: dec.qty } }
          );
        }
        const currentDoc = await db.collection('menu').findOne({ _id: new ObjectId(item.menuId) });
        const remaining = currentDoc ? currentDoc.availableUnits : 0;
        return res.status(409).json({
          error: `Only ${remaining} units of '${item.name || 'item'}' remaining in stock`
        });
      }

      decrementedItems.push({ id: new ObjectId(item.menuId), qty: item.qty });
    }

    // Compute totals server-side
    let totalAmount = 0;
    let estimatedPrepTime = 0;
    const orderItems = [];

    for (const item of items) {
      const doc = menuMap.get(item.menuId);
      const itemTotal = item.qty * doc.amount;
      totalAmount += itemTotal;
      if (doc.prepTime > estimatedPrepTime) {
        estimatedPrepTime = doc.prepTime;
      }
      orderItems.push({
        menuId: doc._id,
        name: doc.name,
        amount: doc.amount,
        qty: item.qty,
        prepTime: doc.prepTime,
        spiceLevel: doc.spiceLevel,
        dietaryType: doc.dietaryType
      });
    }

    const tokenNumber = await getNextToken();

    const newOrder = {
      tokenNumber,
      customerName: customerName.trim(),
      usn: formattedUsn,
      items: orderItems,
      totalAmount,
      estimatedPrepTime,
      status: "placed",
      createdAt: new Date()
    };

    const insertResult = await db.collection('orders').insertOne(newOrder);
    newOrder._id = insertResult.insertedId;

    return res.status(201).json(newOrder);
  } catch (err) {
    console.error('Error placing order:', err);
    return res.status(500).json({ error: "Internal server error while placing order." });
  }
});

// 5. GET /orders/stats - Aggregated stats for dashboard & KDS
// NOTE: Placed before /orders/:id to avoid route collision
app.get('/orders/stats', async (req, res) => {
  try {
    const ordersCollection = db.collection('orders');

    const totalOrders = await ordersCollection.countDocuments();
    const activeOrdersCount = await ordersCollection.countDocuments({
      status: { $in: ['placed', 'preparing', 'ready'] }
    });

    // Revenue calculation
    const revenueAgg = await ordersCollection.aggregate([
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } }
    ]).toArray();
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;

    // Top selling item calculation
    const topItemAgg = await ordersCollection.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.name", totalSold: { $sum: "$items.qty" } } },
      { $sort: { totalSold: -1 } },
      { $limit: 1 }
    ]).toArray();

    const topSellingItem = topItemAgg.length > 0
      ? `${topItemAgg[0]._id} (${topItemAgg[0].totalSold} sold)`
      : "None yet";

    return res.status(200).json({
      totalRevenue,
      totalOrders,
      activeOrdersCount,
      topSellingItem
    });
  } catch (err) {
    console.error('Error fetching order stats:', err);
    return res.status(500).json({ error: "Internal server error while fetching order statistics." });
  }
});

// 6. GET /orders - Returns all active orders sorted by createdAt descending
app.get('/orders', async (req, res) => {
  try {
    const { status, all } = req.query;
    const filter = {};

    if (all === 'true') {
      // return all orders
    } else if (status) {
      if (!['placed', 'preparing', 'ready', 'collected'].includes(status)) {
        return res.status(400).json({ error: "Invalid status filter." });
      }
      filter.status = status;
    } else {
      // Default: active orders (placed, preparing, ready)
      filter.status = { $in: ['placed', 'preparing', 'ready'] };
    }

    const orders = await db.collection('orders')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(orders);
  } catch (err) {
    console.error('Error fetching orders:', err);
    return res.status(500).json({ error: "Internal server error while fetching orders." });
  }
});

// 7. GET /orders/:id - Return single order details (for customer live tracker)
app.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid order ID. Must be a 24-character hexadecimal string." });
    }

    const order = await db.collection('orders').findOne({ _id: new ObjectId(id) });
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    return res.status(200).json(order);
  } catch (err) {
    console.error('Error fetching order by ID:', err);
    return res.status(500).json({ error: "Internal server error while fetching order." });
  }
});

// 8. PATCH /orders/:id/status - Enforces strict state machine:
// "placed" -> "preparing" -> "ready" -> "collected"
app.patch('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid order ID. Must be a 24-character hexadecimal string." });
    }

    const { status: targetStatus } = req.body;
    if (!targetStatus || typeof targetStatus !== 'string') {
      return res.status(400).json({ error: "Target status string is required." });
    }

    const validStatuses = ['placed', 'preparing', 'ready', 'collected'];
    if (!validStatuses.includes(targetStatus)) {
      return res.status(400).json({
        error: `Invalid status '${targetStatus}'. Must strictly be one of: 'placed', 'preparing', 'ready', 'collected'.`
      });
    }

    const order = await db.collection('orders').findOne({ _id: new ObjectId(id) });
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    const currentStatus = order.status;

    // Strict state transitions definition
    const allowedNext = {
      placed: 'preparing',
      preparing: 'ready',
      ready: 'collected',
      collected: null
    };

    if (allowedNext[currentStatus] !== targetStatus) {
      return res.status(400).json({
        error: `Invalid status transition: cannot change order status from '${currentStatus}' to '${targetStatus}'. Allowed next status: '${allowedNext[currentStatus] || 'none'}'.`
      });
    }

    const updateResult = await db.collection('orders').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status: targetStatus, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    return res.status(200).json(updateResult);
  } catch (err) {
    console.error('Error updating order status:', err);
    return res.status(500).json({ error: "Internal server error while updating order status." });
  }
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log(`[MongoDB] Connected successfully to ${MONGO_URI}`);

    db = client.db(DB_NAME);
    console.log(`[MongoDB] Using database: ${DB_NAME}`);

    await seedDatabase();

    const server = app.listen(PORT, () => {
      console.log(`[Server] Smart Canteen Hub running on http://127.0.0.1:${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const fallbackPort = Number(PORT) + 1;
        console.warn(`[Server] Port ${PORT} in use, automatically trying fallback port ${fallbackPort}...`);
        const fallbackServer = app.listen(fallbackPort, () => {
          console.log(`[Server] Smart Canteen Hub running on http://127.0.0.1:${fallbackPort}`);
        });
        fallbackServer.on('error', (fbErr) => {
          console.error(`[Server] Failed to bind to fallback port ${fallbackPort}:`, fbErr.message);
        });
      } else {
        console.error('[Server Error]', err.message);
      }
    });
  } catch (err) {
    console.error('[Startup Error] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}

startServer();
