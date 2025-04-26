const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://abdoulsidi876:JeSuisMedy6002@cluster0.sf9qf8r.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    default: ""
  },
  matricule: {
    type: String,
    required: true,
    unique: true,
  },
  choice: {
    type: String,
    required: true,
    enum: ['for', 'against']
  },
  opinion: {
    type: String,
    default: ""
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', userSchema);

// Routes
app.post('/api/vote', async (req, res) => {
  try {
    const { matricule, choice, name, opinion } = req.body;
    
    // Check if user already voted
    const existingVote = await User.findOne({ matricule });
    if (existingVote) {
      return res.status(400).json({ error: 'User has already voted' });
    }

    // Create new vote
    const newVote = new User({
      matricule,
      choice,
      name,
      opinion
    });

    await newVote.save();
    res.status(201).json(newVote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$choice',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const total = stats.reduce((acc, curr) => acc + curr.count, 0);
    const formatted = stats.reduce((acc, curr) => {
      acc[curr._id] = {
        count: curr.count,
        percentage: ((curr.count / total) * 100).toFixed(2)
      };
      return acc;
    }, {});

    // Get latest opinions
    const latestVotes = await User.find()
      .select('name matricule choice opinion timestamp _id')
      .sort({ timestamp: -1 })
      .limit(10);

    res.json({
      total,
      stats: formatted,
      latestVotes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== 'admin-token') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'sacsac' && password === '12344321') {
    res.json({ token: 'admin-token' });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Get all votes (admin only)
app.get('/api/votes', authenticateAdmin, async (req, res) => {
  try {
    const votes = await User.find().sort({ timestamp: -1 });
    res.json(votes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching votes' });
  }
});

// Get public votes (no auth required)
app.get('/api/public/votes', async (req, res) => {
  try {
    const votes = await User.find()
      .select('name matricule choice opinion createdAt')
      .sort({ createdAt: -1 });
    res.json(votes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching votes' });
  }
});

// Update vote (admin only)
app.put('/api/votes/:id', authenticateAdmin, async (req, res) => {
  try {
    const vote = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    res.json(vote);
  } catch (error) {
    res.status(500).json({ message: 'Error updating vote' });
  }
});

// Delete vote (admin only)
app.delete('/api/votes/:id', authenticateAdmin, async (req, res) => {
  try {
    const vote = await User.findByIdAndDelete(req.params.id);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    res.json({ message: 'Vote deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting vote' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 