# Feedback Project (Node.js + MongoDB + FastAPI ML)

This project contains:
- **Node.js** API (`server.js`) to accept feedback (ratings 1-5), store in MongoDB, and aggregate teacher stats.
- **Python FastAPI** ML service (`ml_service.py`) that predicts next month's average rating per teacher using linear regression.

## Quick start (local)

1. Start MongoDB (local or use Atlas). Default URI: `mongodb://127.0.0.1:27017/feedback_db`.
2. Node.js backend:
   - `cd feedback_project`
   - `npm install`
   - `npm run dev`  (or `npm start`)

3. Python ML service:
   - (optional) create venv: `python -m venv venv && source venv/bin/activate`
   - `pip install -r requirements.txt`
   - `uvicorn ml_service:app --reload --host 0.0.0.0 --port 8001`

4. Test endpoints:
   - Submit feedback:
     ```
     POST http://localhost:4000/submit-feedback
     Body: { "teacher_id": "T001", "teacher_name": "John Doe", "rating": 5 }
     ```
   - Get stats (predictions included if enough history):
     ```
     GET http://localhost:4000/teacher-stats
     ```

## Notes
- The ML service expects at least 2 months of historical monthly average ratings to return a prediction.
- You can change ML model later to ARIMA/Prophet or a neural network.
