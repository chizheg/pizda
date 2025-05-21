const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Static files
app.use('/photo', express.static(path.join(__dirname, 'photo')));

// Database connection
async function connectDB() {
  const client = new MongoClient("mongodb://localhost:27017/");
  await client.connect();
  return client.db("product_store");
}

// Initialize database
async function initDB() {
  const db = await connectDB();
  
  // Create indexes
  await db.collection("products").createIndex({ name: 1 });
  await db.collection("products").createIndex({ category: 1 });
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("orders").createIndex({ userId: 1 });
  
  // Initial users
  const usersCount = await db.collection("users").countDocuments();
  if (usersCount === 0) {
    await db.collection("users").insertMany([
      {
        username: "admin",
        password: await bcrypt.hash("admin123", 10),
        role: "admin",
        createdAt: new Date()
      },
      {
        username: "manager",
        password: await bcrypt.hash("manager123", 10),
        role: "manager",
        createdAt: new Date()
      },
      {
        username: "user",
        password: await bcrypt.hash("user123", 10),
        role: "user",
        createdAt: new Date()
      }
    ]);
  }
  
  // Initial products
  const productsCount = await db.collection("products").countDocuments();
  if (productsCount === 0) {
    await db.collection("products").insertMany([
      {
        name: "Яблоки",
        category: "Фрукты",
        price: 89.99,
        description: "Свежие яблоки",
        stock: 100,
        image: "/photo/apples.jpg",
        createdAt: new Date()
      },
      {
        name: "Молоко",
        category: "Молочные продукты",
        price: 75.50,
        description: "Молоко 2.5%",
        stock: 50,
        image: "/photo/milk.jpg",
        createdAt: new Date()
      }
    ]);
  }
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, 'secret_key', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Routes
app.post("/api/register", async (req, res) => {
  const db = await connectDB();
  const { username, password, role } = req.body;
  
  if (!["admin", "manager", "user"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection("users").insertOne({
      username,
      password: hashedPassword,
      role,
      createdAt: new Date()
    });
    res.status(201).json({ message: "User created" });
  } catch (err) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const db = await connectDB();
  const { username, password } = req.body;
  
  const user = await db.collection("users").findOne({ username });
  if (!user) return res.status(400).json({ error: "User not found" });
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(400).json({ error: "Invalid password" });
  
  const token = jwt.sign(
    { username: user.username, role: user.role },
    'secret_key',
    { expiresIn: '24h' }
  );
  
  res.json({ token, user: { username: user.username, role: user.role } });
});

// Products routes
app.get("/api/products", async (req, res) => {
  const db = await connectDB();
  const products = await db.collection("products").find().toArray();
  res.json(products);
});

app.post("/api/products", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  
  const db = await connectDB();
  const product = {
    ...req.body,
    createdAt: new Date()
  };
  await db.collection("products").insertOne(product);
  res.status(201).json(product);
});

app.put("/api/products/:id", authenticateToken, async (req, res) => {
  if (!["admin", "manager"].includes(req.user.role)) return res.sendStatus(403);
  
  const db = await connectDB();
  await db.collection("products").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.sendStatus(200);
});

app.delete("/api/products/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  
  const db = await connectDB();
  await db.collection("products").deleteOne({ _id: new ObjectId(req.params.id) });
  res.sendStatus(204);
});

// Orders routes
app.get("/api/orders", authenticateToken, async (req, res) => {
  const db = await connectDB();
  const orders = await db.collection("orders").find().toArray();
  res.json(orders);
});

app.post("/api/orders", authenticateToken, async (req, res) => {
  const db = await connectDB();
  const order = {
    ...req.body,
    userId: req.user.username,
    status: "pending",
    createdAt: new Date()
  };
  await db.collection("orders").insertOne(order);
  res.status(201).json(order);
});

// Start server
app.listen(port, async () => {
  await initDB();
  console.log(`Server running on http://localhost:${port}`);
});