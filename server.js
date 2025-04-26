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
app.use(cors({
  origin: ['https://nidalb.onrender.com', 'https://reclamation.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Type']
}));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://abdoulsidi876:JeSuisMedy6002@cluster0.sf9qf8r.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const PORT = process.env.PORT || 5000;

// MongoDB Connection with retry logic
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      ssl: true,
      sslValidate: false,
      retryWrites: true,
      w: 'majority',
      maxPoolSize: 10,
      minPoolSize: 5,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 2000,
      retryReads: true
    });
  } catch (err) {
    setTimeout(connectDB, 5000);
  }
};

// Handle MongoDB connection events
mongoose.connection.on('error', () => {
  setTimeout(connectDB, 5000);
});

mongoose.connection.on('disconnected', () => {
  setTimeout(connectDB, 5000);
});

// Initial connection
connectDB();

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
  }
}, {
  timestamps: true // This will add createdAt and updatedAt automatically
});

const User = mongoose.model('User', userSchema);

// Routes
app.post('/api/vote', async (req, res) => {
  try {
    const { name, matricule, choice, opinion } = req.body;

    // Validate required fields
    if (!name || !matricule || !choice) {
      return res.status(400).json({
        message: 'Missing required fields',
        error: 'Please provide name, matricule, and choice'
      });
    }

    // Validate choice value
    if (choice !== 'for' && choice !== 'against') {
      return res.status(400).json({
        message: 'Invalid choice',
        error: 'Choice must be either "for" or "against"'
      });
    }

    // Validate opinion is required only for 'against' choice
    if (choice === 'against' && !opinion) {
      return res.status(400).json({
        message: 'Opinion required',
        error: 'Please provide an opinion when voting against'
      });
    }

    // Check for duplicate vote
    const existingVote = await User.findOne({ matricule });
    if (existingVote) {
      return res.status(409).json({
        message: 'User has already voted',
        error: 'A vote with this matricule already exists'
      });
    }

    // Create new vote
    const vote = new User({
      name,
      matricule,
      choice,
      opinion: opinion || '' // Make opinion optional
    });

    await vote.save();

    res.status(201).json({
      message: 'Vote created successfully',
      data: vote
    });
  } catch (error) {
    console.error('Error in /api/vote:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        error: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      message: 'Error creating vote',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    // Get total count first
    const total = await User.countDocuments();
    
    // If no votes yet, return empty stats
    if (total === 0) {
      return res.json({
        message: 'Statistics retrieved successfully',
        data: {
          total: 0,
          stats: {
            for: { count: 0, percentage: "0.00" },
            against: { count: 0, percentage: "0.00" }
          },
          latestVotes: []
        }
      });
    }

    // Get vote counts by choice
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$choice',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Format stats with default values for missing choices
    const formatted = {
      for: { count: 0, percentage: "0.00" },
      against: { count: 0, percentage: "0.00" }
    };

    stats.forEach(stat => {
      if (stat._id) {
        formatted[stat._id] = {
          count: stat.count,
          percentage: ((stat.count / total) * 100).toFixed(2)
        };
      }
    });

    // Get latest opinions
    const latestVotes = await User.find()
      .select('name matricule choice opinion createdAt _id')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      message: 'Statistics retrieved successfully',
      data: {
        total,
        stats: formatted,
        latestVotes
      }
    });
  } catch (error) {
    console.error('Error in /api/stats:', error);
    res.status(500).json({ 
      message: 'Error fetching statistics', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    if (token !== 'admin-token') {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Authentication error', error: error.message });
  }
};

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (username === 'sacsac' && password === '12344321') {
      return res.json({ message: 'Login successful', data: { token: 'admin-token' } });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (error) {
    return res.status(500).json({ message: 'Login error', error: error.message });
  }
});

// Get all votes (admin only)
app.get('/api/votes', authenticateAdmin, async (req, res) => {
  try {
    const votes = await User.find().sort({ createdAt: -1 });
    res.json({ message: 'Votes retrieved successfully', data: votes });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching votes', error: error.message });
  }
});

// Get public votes (no auth required)
app.get('/api/public/votes', async (req, res) => {
  try {
    const votes = await User.find()
      .select('name matricule choice opinion createdAt')
      .sort({ createdAt: -1 });
    res.json({ message: 'Public votes retrieved successfully', data: votes });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching public votes', error: error.message });
  }
});

// Update vote (admin only)
app.put('/api/votes/:id', authenticateAdmin, async (req, res) => {
  try {
    const vote = await User.findByIdAndUpdate(
      req.params.id, 
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    res.json({ message: 'Vote updated successfully', data: vote });
  } catch (error) {
    res.status(500).json({ message: 'Error updating vote', error: error.message });
  }
});

// Delete vote (admin only)
app.delete('/api/votes/:id', authenticateAdmin, async (req, res) => {
  try {
    const vote = await User.findByIdAndDelete(req.params.id);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    res.json({ message: 'Vote deleted successfully', data: vote });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting vote', error: error.message });
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