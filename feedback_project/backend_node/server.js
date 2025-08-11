const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ----- Mongoose model -----
const feedbackSchema = new mongoose.Schema({
  teacher_id: { type: String, required: true },
  teacher_name: { type: String, required: true },
  student_id: { type: String, required: false },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: false },
  timestamp: { type: Date, default: Date.now }
}, { collection: 'feedback' });

const Feedback = mongoose.model('Feedback', feedbackSchema);

// ----- Connect to MongoDB -----
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/feedback_db';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// ----- Routes -----
app.get('/', (req, res) => res.send({ ok: true }));

app.post('/submit-feedback', async (req, res) => {
  try {
    const { teacher_id, teacher_name, student_id, rating, comment } = req.body;
    if (!teacher_id || !teacher_name || rating === undefined) {
      return res.status(400).json({ error: 'teacher_id, teacher_name and rating are required' });
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be a number between 1 and 5' });
    }

    const doc = new Feedback({ teacher_id, teacher_name, student_id, rating, comment });
    await doc.save();
    res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

// GET /teacher-stats with optional teacher_id, limit, sortBy, order
app.get('/teacher-stats', async (req, res) => {
  try {
    const { teacher_id, limit = 100, sortBy = 'avg_rating', order = -1 } = req.query;
    const match = {};
    if (teacher_id) match.teacher_id = teacher_id;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { teacher_id: '$teacher_id', teacher_name: '$teacher_name' },
          avg_rating: { $avg: '$rating' },
          total_feedback: { $sum: 1 },
          positive_count: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
          neutral_count: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          negative_count: { $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] } },
          min_rating: { $min: '$rating' },
          max_rating: { $max: '$rating' }
        }
      },
      {
        $project: {
          _id: 0,
          teacher_id: '$_id.teacher_id',
          teacher_name: '$_id.teacher_name',
          avg_rating: { $round: ['$avg_rating', 2] },
          total_feedback: 1,
          positive_count: 1,
          positive_percent: { $round: [{ $multiply: [{ $divide: ['$positive_count', '$total_feedback'] }, 100] }, 2] },
          neutral_count: 1,
          neutral_percent: { $round: [{ $multiply: [{ $divide: ['$neutral_count', '$total_feedback'] }, 100] }, 2] },
          negative_count: 1,
          negative_percent: { $round: [{ $multiply: [{ $divide: ['$negative_count', '$total_feedback'] }, 100] }, 2] },
          min_rating: 1,
          max_rating: 1
        }
      },
      { $sort: { [sortBy]: parseInt(order) } },
      { $limit: parseInt(limit) }
    ];

    const stats = await Feedback.aggregate(pipeline);

    // For each teacher, fetch historical monthly averages and call ML service
    const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001/predict';

    for (const teacher of stats) {
      try {
        const historyPipeline = [
          { $match: { teacher_id: teacher.teacher_id } },
          {
            $group: {
              _id: { month: { $dateToString: { format: "%Y-%m", date: "$timestamp" } } },
              avg_rating: { $avg: "$rating" }
            }
          },
          { $sort: { "_id.month": 1 } }
        ];
        const history = await Feedback.aggregate(historyPipeline);

        const payload = {
          data: history.map(h => ({ month: h._id.month, avg_rating: h.avg_rating }))
        };

        if (payload.data.length >= 2) {
          const response = await fetch(ML_SERVICE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const jd = await response.json();
          teacher.predicted_rating = jd.predicted_rating || null;
        } else {
          teacher.predicted_rating = null;
        }
      } catch (err) {
        console.error('ML service call error for', teacher.teacher_id, err);
        teacher.predicted_rating = null;
      }
    }

    res.json({ count: stats.length, results: stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

// Raw feedback per teacher
app.get('/feedback/:teacher_id', async (req, res) => {
  try {
    const { teacher_id } = req.params;
    const page = parseInt(req.query.page || 1);
    const size = Math.min(parseInt(req.query.size || 50), 200);
    const docs = await Feedback.find({ teacher_id })
      .sort({ timestamp: -1 })
      .skip((page - 1) * size)
      .limit(size)
      .lean();
    res.json({ page, size, items: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
