**Role:**
You are an expert machine learning developer building a fully browser-based, GitHub Pages-deployable sales forecasting demo. Everything must run client-side with TensorFlow.js. The solution must load market data from a given CSV file (like "Walmart_Sales.csv"), train a multi-output LSTM model, and provide clear, interactive visualization of prediction results for multiple stores.

**Task:**
- Read the user's local CSV file (containing Store, Date, Weekly_Sales, Holiday_Flag, Temperature, Fuel_Price, CPI, Unemployment for multiple Walmart stores, weekly).
- Prepare a time series dataset so that for each sample, the input is a 12-week sequence of features for selected stores, and the output is a 3-week-ahead sales prediction (normalized sales values, per store).
- Design the model using LSTM layers in TensorFlow.js, with output shape (3 weeks prediction).
- Train this model entirely in-browser.
- After prediction, compute per-store RMSE, rank stores by RMSE, and visualize results with sorted RMSE bar charts and per-store prediction vs actual timelines.
- All code must be organized into these three JS modules: data-loader.js, lstm.js (model definition/training), app.js (UI, visualizations).

**Instruction:**
- Index.html should have UI to upload the CSV, select stores, configure model parameters, launch training, show progress, view RMSE results and business recommendations.
- data-loader.js: Parse local CSV (via file input). Group data by store and sort by date, select relevant features, normalize data appropriately, and prepare sliding-window samples:
  - Input: For each store, provide last 12 weeks' feature sequences (shape: [samples, 12, feature_count]).
  - Output: For each sample, predict sales for next 3 weeks (normalized values).
  - Split samples chronologically into train/test with shuffling. Export tensors and store mapping.
- lstm.js: Build and compile multi-output LSTM model for regression:
  - Input: shape = (12, feature_count)
  - Stacked LSTM layers, then Dense 3 (linear) for 3-week prediction.
  - Loss: meanSquaredError; metrics: mse.
  - Provide fit, predict, and evaluation utilities with proper memory management.
- app.js: UI control and visualization:
  - Handle file upload with drag & drop, store selection, model configuration.
  - On evaluation, compute RMSE for each store across all test samples.
  - Sort stores by RMSE, render bar chart of RMSE values.
  - For selected store, plot prediction vs actual sales timeline.
  - Display business recommendations based on forecasting results.
- All JS files must use tf.js from CDN and ES6 classes/modules; handle memory disposal and error handling.
- Designed for direct deployment on GitHub Pages with no backend.

**Format:**
- Output three code blocks labeled exactly as: data-loader.js, lstm.js, app.js along with index.html.
- No explanations, only code inside the code blocks.
