// Global variables
let trainData = null;
let testData = null;
let preprocessedTrainData = null;
let preprocessedTestData = null;
let model = null;
let trainingHistory = null;
let validationData = null;
let validationLabels = null;
let validationPredictions = null;
let testPredictions = null;

// Schema configuration - change these for different datasets
const TARGET_FEATURE = 'Survived'; // Binary classification target
const ID_FEATURE = 'PassengerId'; // Identifier to exclude from features
const NUMERICAL_FEATURES = ['Age', 'Fare', 'SibSp', 'Parch']; // Numerical features
const CATEGORICAL_FEATURES = ['Pclass', 'Sex', 'Embarked']; // Categorical features

// Load data from uploaded CSV files
async function loadData() {
    const trainFile = document.getElementById('train-file').files[0];
    const testFile = document.getElementById('test-file').files[0];
    
    if (!trainFile || !testFile) {
        alert('Please upload both training and test CSV files.');
        return;
    }
    
    const statusDiv = document.getElementById('data-status');
    statusDiv.innerHTML = 'Loading data...';
    
    try {
        // Load training data using Papa Parse
        trainData = await parseCSVWithPapa(trainFile);
        
        // Load test data using Papa Parse
        testData = await parseCSVWithPapa(testFile);
        
        statusDiv.innerHTML = `Data loaded successfully! Training: ${trainData.length} samples, Test: ${testData.length} samples`;
        
        // Enable the inspect button
        document.getElementById('inspect-btn').disabled = false;
    } catch (error) {
        statusDiv.innerHTML = `Error loading data: ${error.message}`;
        console.error(error);
    }
}

// Parse CSV file using Papa Parse
function parseCSVWithPapa(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true, // Автоматическое преобразование типов
            skipEmptyLines: true,
            complete: function(results) {
                // Обрабатываем пустые значения
                const processedData = results.data.map(row => {
                    const processedRow = {};
                    for (const key in row) {
                        // Заменяем пустые строки, null, undefined на null
                        if (row[key] === '' || row[key] === null || row[key] === undefined) {
                            processedRow[key] = null;
                        } else {
                            processedRow[key] = row[key];
                        }
                    }
                    return processedRow;
                });
                resolve(processedData);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

// Read file as text (теперь не используется для парсинга, но оставим на всякий случай)
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

// Create a preview table from data
function createPreviewTable(data) {
    const table = document.createElement('table');
    table.style.border = '1px solid black';
    table.style.borderCollapse = 'collapse';
    
    // Create header row
    const headerRow = document.createElement('tr');
    Object.keys(data[0]).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        th.style.border = '1px solid black';
        th.style.padding = '5px';
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    // Create data rows
    data.forEach(row => {
        const tr = document.createElement('tr');
        Object.values(row).forEach(value => {
            const td = document.createElement('td');
            td.textContent = value !== null ? value : 'NULL';
            td.style.border = '1px solid black';
            td.style.padding = '3px';
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    
    return table;
}

// Inspect the loaded data
function inspectData() {
    if (!trainData || trainData.length === 0) {
        alert('Please load data first.');
        return;
    }
    
    console.log('First row of trainData:', trainData[0]);
    
    // Show data preview
    const previewDiv = document.getElementById('data-preview');
    previewDiv.innerHTML = '<h3>Data Preview (First 10 Rows)</h3>';
    previewDiv.appendChild(createPreviewTable(trainData.slice(0, 10)));
    
    // Calculate and show data statistics
    const statsDiv = document.getElementById('data-stats');
    statsDiv.innerHTML = '<h3>Data Statistics</h3>';
    
    const shapeInfo = `Dataset shape: ${trainData.length} rows x ${Object.keys(trainData[0]).length} columns`;
    const survivalCount = trainData.filter(row => row[TARGET_FEATURE] === 1).length;
    const survivalRate = (survivalCount / trainData.length * 100).toFixed(2);
    const targetInfo = `Survival rate: ${survivalCount}/${trainData.length} (${survivalRate}%)`;
    
    // Calculate missing values percentage for each feature
    let missingInfo = '<h4>Missing Values Percentage:</h4><ul>';
    Object.keys(trainData[0]).forEach(feature => {
        const missingCount = trainData.filter(row => row[feature] === null || row[feature] === undefined).length;
        const missingPercent = (missingCount / trainData.length * 100).toFixed(2);
        missingInfo += `<li>${feature}: ${missingPercent}%</li>`;
    });
    missingInfo += '</ul>';
    
    statsDiv.innerHTML += `<p>${shapeInfo}</p><p>${targetInfo}</p>${missingInfo}`;
    
    // Create visualizations
    createVisualizations();
    
    // Enable the preprocess button
    document.getElementById('preprocess-btn').disabled = false;
}

// Create visualizations using tfjs-vis
function createVisualizations() {
    const chartsDiv = document.getElementById('charts');
    chartsDiv.innerHTML = '<h3>Data Visualizations</h3>';
    
    // Survival by Sex
    const survivalBySex = {};
    trainData.forEach(row => {
        if (row.Sex && row.Survived !== undefined && row.Survived !== null) {
            if (!survivalBySex[row.Sex]) {
                survivalBySex[row.Sex] = { survived: 0, total: 0 };
            }
            survivalBySex[row.Sex].total++;
            if (row.Survived === 1) {
                survivalBySex[row.Sex].survived++;
            }
        }
    });
    
    const sexData = Object.entries(survivalBySex).map(([sex, stats]) => ({
        sex,
        survivalRate: (stats.survived / stats.total) * 100
    }));
    
    tfvis.render.barchart(
        { name: 'Survival Rate by Sex', tab: 'Charts' },
        sexData.map(d => ({ x: d.sex, y: d.survivalRate })),
        { xLabel: 'Sex', yLabel: 'Survival Rate (%)' }
    );
    
    // Survival by Pclass
    const survivalByPclass = {};
    trainData.forEach(row => {
        if (row.Pclass !== undefined && row.Pclass !== null && row.Survived !== undefined && row.Survived !== null) {
            if (!survivalByPclass[row.Pclass]) {
                survivalByPclass[row.Pclass] = { survived: 0, total: 0 };
            }
            survivalByPclass[row.Pclass].total++;
            if (row.Survived === 1) {
                survivalByPclass[row.Pclass].survived++;
            }
        }
    });
    
    const pclassData = Object.entries(survivalByPclass).map(([pclass, stats]) => ({
        pclass: `Class ${pclass}`,
        survivalRate: (stats.survived / stats.total) * 100
    }));
    
    tfvis.render.barchart(
        { name: 'Survival Rate by Passenger Class', tab: 'Charts' },
        pclassData.map(d => ({ x: d.pclass, y: d.survivalRate })),
        { xLabel: 'Passenger Class', yLabel: 'Survival Rate (%)' }
    );
    
    chartsDiv.innerHTML += '<p>Charts are displayed in the tfjs-vis visor. Click the button in the bottom right to view.</p>';
}

// Calculate median of an array
function calculateMedian(values) {
    const validValues = values.filter(v => v !== null && v !== undefined);
    if (validValues.length === 0) return 0;
    
    validValues.sort((a, b) => a - b);
    const half = Math.floor(validValues.length / 2);
    
    if (validValues.length % 2 === 0) {
        return (validValues[half - 1] + validValues[half]) / 2;
    }
    
    return validValues[half];
}

// Calculate mode of an array
function calculateMode(values) {
    const validValues = values.filter(v => v !== null && v !== undefined);
    if (validValues.length === 0) return null;
    
    const frequency = {};
    let maxCount = 0;
    let mode = null;
    
    validValues.forEach(value => {
        frequency[value] = (frequency[value] || 0) + 1;
        if (frequency[value] > maxCount) {
            maxCount = frequency[value];
            mode = value;
        }
    });
    
    return mode;
}

// Calculate standard deviation of an array
function calculateStdDev(values) {
    // Filter out null values first
    const validValues = values.filter(v => v !== null && v !== undefined);
    if (validValues.length === 0) return 0;
    
    const mean = validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
    const squaredDiffs = validValues.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / validValues.length;
    return Math.sqrt(variance);
}

// One-hot encode a value
function oneHotEncode(value, categories) {
    const encoding = new Array(categories.length).fill(0);
    const index = categories.indexOf(value);
    if (index !== -1) {
        encoding[index] = 1;
    }
    return encoding;
}

// Extract features from a row with imputation and normalization
function extractFeatures(row, ageMedian, fareMedian, embarkedMode) {
    // Helper function to safely get numeric values
    const getNumeric = (field) => {
        const value = row[field];
        return (value !== null && value !== undefined) ? value : null;
    };

    // Helper function to safely get string values
    const getString = (field) => {
        const value = row[field];
        return (value !== null && value !== undefined) ? value.toString() : null;
    };

    // Impute missing values
    const age = getNumeric('Age') !== null ? getNumeric('Age') : ageMedian;
    const fare = getNumeric('Fare') !== null ? getNumeric('Fare') : fareMedian;
    const embarked = getString('Embarked') !== null ? getString('Embarked') : embarkedMode;
    
    // Standardize numerical features
    const ageStdDev = calculateStdDev(trainData.map(r => r.Age).filter(a => a !== null && a !== undefined));
    const fareStdDev = calculateStdDev(trainData.map(r => r.Fare).filter(f => f !== null && f !== undefined));
    
    const standardizedAge = (age - ageMedian) / (ageStdDev || 1);
    const standardizedFare = (fare - fareMedian) / (fareStdDev || 1);
    
    // One-hot encode categorical features
    const pclassOneHot = oneHotEncode(getNumeric('Pclass'), [1, 2, 3]);
    const sexOneHot = oneHotEncode(getString('Sex'), ['male', 'female']);
    const embarkedOneHot = oneHotEncode(embarked, ['C', 'Q', 'S']);
    
    // Start with numerical features
    let features = [
        standardizedAge,
        standardizedFare,
        getNumeric('SibSp') || 0,
        getNumeric('Parch') || 0
    ];
    
    // Add one-hot encoded features
    features = features.concat(pclassOneHot, sexOneHot, embarkedOneHot);
    
    // Add optional family features if enabled
    if (document.getElementById('add-family-features').checked) {
        const familySize = (getNumeric('SibSp') || 0) + (getNumeric('Parch') || 0) + 1;
        const isAlone = familySize === 1 ? 1 : 0;
        features.push(familySize, isAlone);
    }
    
    return features;
}

// Preprocess the data
function preprocessData() {
    if (!trainData || !testData) {
        alert('Please load data first.');
        return;
    }
    
    const outputDiv = document.getElementById('preprocessing-output');
    outputDiv.innerHTML = 'Preprocessing data...';
    
    try {
        // Calculate imputation values from training data
        const ageMedian = calculateMedian(trainData.map(row => row.Age));
        const fareMedian = calculateMedian(trainData.map(row => row.Fare));
        const embarkedMode = calculateMode(trainData.map(row => row.Embarked));
        
        console.log('Imputation values:', { ageMedian, fareMedian, embarkedMode });
        
        // Preprocess training data
        preprocessedTrainData = {
            features: [],
            labels: []
        };
        
        trainData.forEach(row => {
            const features = extractFeatures(row, ageMedian, fareMedian, embarkedMode);
            preprocessedTrainData.features.push(features);
            preprocessedTrainData.labels.push(row[TARGET_FEATURE]);
        });
        
        // Preprocess test data
        preprocessedTestData = {
            features: [],
            passengerIds: []
        };
        
        testData.forEach(row => {
            const features = extractFeatures(row, ageMedian, fareMedian, embarkedMode);
            preprocessedTestData.features.push(features);
            preprocessedTestData.passengerIds.push(row[ID_FEATURE]);
        });
        
        console.log('First preprocessed features:', preprocessedTrainData.features[0]);
        console.log('First preprocessed label:', preprocessedTrainData.labels[0]);
        
        // Convert to tensors
        preprocessedTrainData.features = tf.tensor2d(preprocessedTrainData.features);
        preprocessedTrainData.labels = tf.tensor1d(preprocessedTrainData.labels);
        
        outputDiv.innerHTML = `
            <p>Preprocessing completed!</p>
            <p>Training features shape: ${preprocessedTrainData.features.shape}</p>
            <p>Training labels shape: ${preprocessedTrainData.labels.shape}</p>
            <p>Test features shape: [${preprocessedTestData.features.length}, ${preprocessedTestData.features[0] ? preprocessedTestData.features[0].length : 0}]</p>
            <p>First feature vector: ${JSON.stringify(preprocessedTrainData.features.arraySync()[0])}</p>
        `;
        
        // Enable the create model button
        document.getElementById('create-model-btn').disabled = false;
    } catch (error) {
        outputDiv.innerHTML = `Error during preprocessing: ${error.message}`;
        console.error(error);
    }
}

// Остальные функции (createModel, trainModel, updateMetrics, plotROC, predict, createPredictionTable, exportResults)
// остаются без изменений, как в вашем оригинальном коде

// Create the model
function createModel() {
    if (!preprocessedTrainData) {
        alert('Please preprocess data first.');
        return;
    }
    
    const inputShape = preprocessedTrainData.features.shape[1];
    
    // Create a sequential model
    model = tf.sequential();
    
    // Add layers
    model.add(tf.layers.dense({
        units: 16,
        activation: 'relu',
        inputShape: [inputShape]
    }));
    
    model.add(tf.layers.dense({
        units: 1,
        activation: 'sigmoid'
    }));
    
    // Compile the model
    model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });
    
    // Display model summary
    const summaryDiv = document.getElementById('model-summary');
    summaryDiv.innerHTML = '<h3>Model Summary</h3>';
    
    // Simple summary since tfjs doesn't have a built-in summary function for the browser
    let summaryText = '<ul>';
    model.layers.forEach((layer, i) => {
        summaryText += `<li>Layer ${i+1}: ${layer.getClassName()} - Output Shape: ${JSON.stringify(layer.outputShape)}</li>`;
    });
    summaryText += '</ul>';
    summaryText += `<p>Total parameters: ${model.countParams()}</p>`;
    summaryDiv.innerHTML += summaryText;
    
    // Enable the train button
    document.getElementById('train-btn').disabled = false;
}

// Train the model
async function trainModel() {
    if (!model || !preprocessedTrainData) {
        alert('Please create model first.');
        return;
    }
    
    const statusDiv = document.getElementById('training-status');
    statusDiv.innerHTML = 'Training model...';
    
    try {
        // Split training data into train and validation sets (80/20)
        const splitIndex = Math.floor(preprocessedTrainData.features.shape[0] * 0.8);
        
        const trainFeatures = preprocessedTrainData.features.slice(0, splitIndex);
        const trainLabels = preprocessedTrainData.labels.slice(0, splitIndex);
        
        const valFeatures = preprocessedTrainData.features.slice(splitIndex);
        const valLabels = preprocessedTrainData.labels.slice(splitIndex);
        
        // Store validation data for later evaluation
        validationData = valFeatures;
        validationLabels = valLabels;
        
        // Train the model
        trainingHistory = await model.fit(trainFeatures, trainLabels, {
            epochs: 50,
            batchSize: 32,
            validationData: [valFeatures, valLabels],
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    statusDiv.innerHTML = `Epoch ${epoch + 1}/50 - loss: ${logs.loss.toFixed(4)}, acc: ${logs.acc.toFixed(4)}, val_loss: ${logs.val_loss.toFixed(4)}, val_acc: ${logs.val_acc.toFixed(4)}`;
                    console.log(`Epoch ${epoch + 1}`, logs);
                }
            }
        });
        
        statusDiv.innerHTML += '<p>Training completed!</p>';
        
        // Make predictions on validation set for evaluation
        validationPredictions = model.predict(validationData);
        
        // Enable the threshold slider and evaluation
        document.getElementById('threshold-slider').disabled = false;
        document.getElementById('threshold-slider').addEventListener('input', updateMetrics);
        
        // Enable the predict button
        document.getElementById('predict-btn').disabled = false;
        
        // Calculate initial metrics
        updateMetrics();
    } catch (error) {
        statusDiv.innerHTML = `Error during training: ${error.message}`;
        console.error(error);
    }
}

// Update metrics based on threshold
async function updateMetrics() {
    if (!validationPredictions || !validationLabels) return;
    
    const threshold = parseFloat(document.getElementById('threshold-slider').value);
    document.getElementById('threshold-value').textContent = threshold.toFixed(2);
    
    // Calculate confusion matrix
    const predVals = validationPredictions.arraySync();
    const trueVals = validationLabels.arraySync();
    
    let tp = 0, tn = 0, fp = 0, fn = 0;
    
    for (let i = 0; i < predVals.length; i++) {
        const prediction = predVals[i] >= threshold ? 1 : 0;
        const actual = trueVals[i];
        
        if (prediction === 1 && actual === 1) tp++;
        else if (prediction === 0 && actual === 0) tn++;
        else if (prediction === 1 && actual === 0) fp++;
        else if (prediction === 0 && actual === 1) fn++;
    }
    
    // Update confusion matrix display
    const cmDiv = document.getElementById('confusion-matrix');
    cmDiv.innerHTML = `
        <table style="border-collapse: collapse; border: 1px solid black;">
            <tr><th style="border: 1px solid black; padding: 5px;"></th><th style="border: 1px solid black; padding: 5px;">Predicted Positive</th><th style="border: 1px solid black; padding: 5px;">Predicted Negative</th></tr>
            <tr><th style="border: 1px solid black; padding: 5px;">Actual Positive</th><td style="border: 1px solid black; padding: 5px; text-align: center;">${tp}</td><td style="border: 1px solid black; padding: 5px; text-align: center;">${fn}</td></tr>
            <tr><th style="border: 1px solid black; padding: 5px;">Actual Negative</th><td style="border: 1px solid black; padding: 5px; text-align: center;">${fp}</td><td style="border: 1px solid black; padding: 5px; text-align: center;">${tn}</td></tr>
        </table>
    `;
    
    // Calculate performance metrics
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    const accuracy = (tp + tn) / (tp + tn + fp + fn) || 0;
    
    // Update performance metrics display
    const metricsDiv = document.getElementById('performance-metrics');
    metricsDiv.innerHTML = `
        <p>Accuracy: ${(accuracy * 100).toFixed(2)}%</p>
        <p>Precision: ${precision.toFixed(4)}</p>
        <p>Recall: ${recall.toFixed(4)}</p>
        <p>F1 Score: ${f1.toFixed(4)}</p>
    `;
    
    // Calculate and plot ROC curve
    await plotROC(trueVals, predVals);
}

// Plot ROC curve
async function plotROC(trueLabels, predictions) {
    // Calculate TPR and FPR for different thresholds
    const thresholds = Array.from({ length: 100 }, (_, i) => i / 100);
    const rocData = [];
    
    thresholds.forEach(threshold => {
        let tp = 0, fn = 0, fp = 0, tn = 0;
        
        for (let i = 0; i < predictions.length; i++) {
            const prediction = predictions[i] >= threshold ? 1 : 0;
            const actual = trueLabels[i];
            
            if (actual === 1) {
                if (prediction === 1) tp++;
                else fn++;
            } else {
                if (prediction === 1) fp++;
                else tn++;
            }
        }
        
        const tpr = tp / (tp + fn) || 0;
        const fpr = fp / (fp + tn) || 0;
        
        rocData.push({ threshold, fpr, tpr });
    });
    
    // Calculate AUC (approximate using trapezoidal rule)
    let auc = 0;
    for (let i = 1; i < rocData.length; i++) {
        auc += (rocData[i].fpr - rocData[i-1].fpr) * (rocData[i].tpr + rocData[i-1].tpr) / 2;
    }
    
    // Plot ROC curve
    tfvis.render.linechart(
        { name: 'ROC Curve', tab: 'Evaluation' },
        { values: rocData.map(d => ({ x: d.fpr, y: d.tpr })) },
        { 
            xLabel: 'False Positive Rate', 
            yLabel: 'True Positive Rate',
            series: ['ROC Curve'],
            width: 400,
            height: 400
        }
    );
    
    // Add AUC to performance metrics
    const metricsDiv = document.getElementById('performance-metrics');
    metricsDiv.innerHTML += `<p>AUC: ${auc.toFixed(4)}</p>`;
}

// Predict on test data
// Predict on test data
async function predict() {
    if (!model || !preprocessedTestData) {
        alert('Please train model first.');
        return;
    }
    
    const outputDiv = document.getElementById('prediction-output');
    outputDiv.innerHTML = 'Making predictions...';
    
    try {
        // Convert test features to tensor
        const testFeatures = tf.tensor2d(preprocessedTestData.features);
        
        // Make predictions
        testPredictions = model.predict(testFeatures);
        const predValues = testPredictions.arraySync();
        
        console.log('Prediction values sample:', predValues.slice(0, 5)); // Добавьте для отладки
        
        // Create prediction results
        const results = preprocessedTestData.passengerIds.map((id, i) => {
            const prob = predValues[i];
            // Убедимся, что probability - число
            const probability = typeof prob === 'number' ? prob : parseFloat(prob);
            
            return {
                PassengerId: id,
                Survived: probability >= 0.5 ? 1 : 0,
                Probability: probability
            };
        });
        
        // Show first 10 predictions
        outputDiv.innerHTML = '<h3>Prediction Results (First 10 Rows)</h3>';
        outputDiv.appendChild(createPredictionTable(results.slice(0, 10)));
        
        outputDiv.innerHTML += `<p>Predictions completed! Total: ${results.length} samples</p>`;
        
        // Enable the export button
        document.getElementById('export-btn').disabled = false;
    } catch (error) {
        outputDiv.innerHTML = `Error during prediction: ${error.message}`;
        console.error('Prediction error details:', error);
    }
}
// Create prediction table
function createPredictionTable(data) {
    const table = document.createElement('table');
    table.style.border = '1px solid black';
    table.style.borderCollapse = 'collapse';
    
    // Create header row
    const headerRow = document.createElement('tr');
    ['PassengerId', 'Survived', 'Probability'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        th.style.border = '1px solid black';
        th.style.padding = '5px';
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    // Create data rows
    data.forEach(row => {
        const tr = document.createElement('tr');
        ['PassengerId', 'Survived', 'Probability'].forEach(key => {
            const td = document.createElement('td');
            td.textContent = key === 'Probability' ? row[key].toFixed(4) : row[key];
            td.style.border = '1px solid black';
            td.style.padding = '3px';
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    
    return table;
}

// Export results
async function exportResults() {
    if (!testPredictions || !preprocessedTestData) {
        alert('Please make predictions first.');
        return;
    }
    
    const statusDiv = document.getElementById('export-status');
    statusDiv.innerHTML = 'Exporting results...';
    
    try {
        // Get predictions
        const predValues = testPredictions.arraySync();
        
        // Create submission CSV (PassengerId, Survived)
        let submissionCSV = 'PassengerId,Survived\n';
        preprocessedTestData.passengerIds.forEach((id, i) => {
            submissionCSV += `${id},${predValues[i] >= 0.5 ? 1 : 0}\n`;
        });
        
        // Create probabilities CSV (PassengerId, Probability)
        let probabilitiesCSV = 'PassengerId,Probability\n';
        preprocessedTestData.passengerIds.forEach((id, i) => {
            probabilitiesCSV += `${id},${predValues[i].toFixed(6)}\n`;
        });
        
        // Create download links
        const submissionLink = document.createElement('a');
        submissionLink.href = URL.createObjectURL(new Blob([submissionCSV], { type: 'text/csv' }));
        submissionLink.download = 'submission.csv';
        
        const probabilitiesLink = document.createElement('a');
        probabilitiesLink.href = URL.createObjectURL(new Blob([probabilitiesCSV], { type: 'text/csv' }));
        probabilitiesLink.download = 'probabilities.csv';
        
        // Trigger downloads
        submissionLink.click();
        probabilitiesLink.click();
        
        // Save model
        await model.save('downloads://titanic-tfjs-model');
        
        statusDiv.innerHTML = `
            <p>Export completed!</p>
            <p>Downloaded: submission.csv (Kaggle submission format)</p>
            <p>Downloaded: probabilities.csv (Prediction probabilities)</p>
            <p>Model saved to browser downloads</p>
        `;
    } catch (error) {
        statusDiv.innerHTML = `Error during export: ${error.message}`;
        console.error(error);
    }
}
