from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from sklearn.linear_model import LinearRegression
import numpy as np

app = FastAPI()

class RatingData(BaseModel):
    month: str   # e.g. "2025-01"
    avg_rating: float

class PredictionRequest(BaseModel):
    data: List[RatingData]

@app.post("/predict")
def predict_future_rating(request: PredictionRequest):
    X = np.arange(len(request.data)).reshape(-1, 1)
    y = np.array([item.avg_rating for item in request.data])

    if len(X) < 2:
        return {"error": "Need at least 2 months of data for prediction"}

    model = LinearRegression()
    model.fit(X, y)

    next_month_index = len(X)
    prediction = model.predict([[next_month_index]])[0]

    return {"predicted_rating": round(float(prediction), 2)}
