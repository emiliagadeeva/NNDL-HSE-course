Role: You are an expert machine learning developer building a fully browser-based, GitHub Pages-deployable stock prediction demo. Everything must run client-side with TensorFlow.js. The solution must load market data from a given CSV file (like "sales.csv"), train a multi-output LSTM model, and provide clear, interactive visualization of results for multiple stores.

Task:

Read the user's local CSV file (containing Store,Date,Weekly_Sales,Holiday_Flag,Temperature,Fuel_Price,CPI,Unemployment (weekly)).
Prepare a time series dataset so that for each sample, the input is a 12-week sequence of features for 10 stores, and the output is the value of sales for next 3 weeks.
Design the model using LSTM in TensorFlow.js, with output shape (10 stores × 3 weeks = 30 values).
Train this model entirely in-browser.
After prediction, compute per-store RMSE, rank the 10 stores by RMSE, and visualize results with sorted RMSE bar charts and per-stock prediction timelines (correct/wrong).
All code must be organized into these three JS modules: data-loader.js, gru.js (model definition/training), app.js (UI, visualizations).
Instruction:

Index.html (not included here) should have UI to upload the CSV, launch training, show progress, view RMSE.
data-loader.js: Parse local CSV (via file input).
Split samples chronologically into train/test. Export tensors: X_train, y_train, X_test, y_test.
gru.js: Build and compile multi-output LSTM
Input: shape = (12, 20)
Provide fit, predict, and evaluation utilities. Allow for saving and reloading weights if desired.
app.js: UI control and visualization:
Tie UI to data, model, and training flow.
On evaluation, compute RMSE for each stock across all test samples (averaged over 3 output days).
Sort stocks by RMSE, render a horizontal bar chart of accuracies (best to worst).
For each stock, plot a colored timeline of prediction results (green/red for correct/wrong, timeline is day axis).
All JS files must use tf.js from CDN and ES6 classes/modules; all dependencies must be client-side.
Code must handle memory disposal, edge/corner cases, and robust error handling for file loading and shape mismatches.
Use clear English comments.
Designed for direct deployment on GitHub Pages (no server or Python backend).
Format:

Output three code blocks labeled exactly as: data-loader.js, gru.js, app.js along with index.html.
No explanations, only code inside the code blocks.
