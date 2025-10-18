class SalesForecastingApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.lstm = new LSTMForecaster();
        this.selectedStores = [];
        this.trainingData = null;
        this.testResults = null;
        
        this.initializeEventListeners();
        this.initializeCharts();
    }

    initializeEventListeners() {
        // File upload
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('fileInput');
        
        fileUpload.addEventListener('click', () => fileInput.click());
        fileUpload.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUpload.classList.add('dragover');
        });
        fileUpload.addEventListener('dragleave', () => {
            fileUpload.classList.remove('dragover');
        });
        fileUpload.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUpload.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });

        // Model controls - FIXED SLIDERS
        const windowSizeSlider = document.getElementById('windowSize');
        const trainSplitSlider = document.getElementById('trainSplit');
        
        windowSizeSlider.addEventListener('input', (e) => {
            document.getElementById('windowSizeValue').textContent = e.target.value;
        });
        
        trainSplitSlider.addEventListener('input', (e) => {
            document.getElementById('trainSplitValue').textContent = e.target.value + '%';
        });

        // Initialize slider values
        document.getElementById('windowSizeValue').textContent = windowSizeSlider.value;
        document.getElementById('trainSplitValue').textContent = trainSplitSlider.value + '%';

        document.getElementById('trainBtn').addEventListener('click', () => this.trainModel());
        document.getElementById('testBtn').addEventListener('click', () => this.testModel());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportResults());
        
        document.getElementById('storeChartSelect').addEventListener('change', (e) => {
            this.updatePredictionChart(e.target.value);
        });

        // Store selection
        document.getElementById('storeSelect').addEventListener('change', (e) => {
            this.updateSelectedStores();
        });
    }

    initializeCharts() {
        // Loss chart
        this.lossChart = new Chart(document.getElementById('lossChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Training Loss',
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        data: [],
                        fill: true
                    },
                    {
                        label: 'Validation Loss',
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        data: [],
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Loss' }
                    },
                    x: {
                        title: { display: true, text: 'Epoch' }
                    }
                }
            }
        });

        // RMSE chart
        this.rmseChart = new Chart(document.getElementById('rmseChart'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'RMSE',
                    backgroundColor: '#ff6b6b',
                    borderColor: '#fa5252',
                    borderWidth: 1,
                    data: []
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'RMSE' }
                    },
                    x: {
                        title: { display: true, text: 'Store' }
                    }
                }
            }
        });

        // Prediction chart
        this.predictionChart = new Chart(document.getElementById('predictionChart'), {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3'],
                datasets: [
                    {
                        label: 'Actual Sales',
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        data: [],
                        borderWidth: 2,
                        pointRadius: 4
                    },
                    {
                        label: 'Predicted Sales',
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        data: [],
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Sales (millions)' }
                    }
                }
            }
        });
    }

    async handleFileUpload(file) {
        try {
            // Show loading state
            document.getElementById('fileUpload').innerHTML = '<p>📊 Loading data...</p>';
            
            const data = await this.dataLoader.loadCSV(file);
            this.showDataPreview();
            this.populateStoreSelect();
            
            // Reset file upload area
            document.getElementById('fileUpload').innerHTML = `
                <p>✅ Data loaded successfully!</p>
                <p>📁 Drag & drop another CSV file here or click to select</p>
                <input type="file" id="fileInput" accept=".csv" style="display: none;">
            `;
            
            // Re-attach event listeners
            document.getElementById('fileUpload').addEventListener('click', () => document.getElementById('fileInput').click());
            
            document.getElementById('trainBtn').disabled = false;
            
        } catch (error) {
            console.error('Error loading file:', error);
            document.getElementById('fileUpload').innerHTML = `
                <p>❌ Error loading file: ${error.message}</p>
                <p>📁 Drag & drop CSV file here or click to select</p>
                <input type="file" id="fileInput" accept=".csv" style="display: none;">
            `;
            // Re-attach event listeners
            document.getElementById('fileUpload').addEventListener('click', () => document.getElementById('fileInput').click());
        }
    }

    showDataPreview() {
        const preview = this.dataLoader.getDataPreview(10);
        const previewTable = document.getElementById('previewTable');
        
        if (preview.length === 0) {
            previewTable.innerHTML = '<p>No data to display</p>';
            return;
        }
        
        let html = '<table><thead><tr>';
        Object.keys(preview[0]).forEach(key => {
            if (key !== 'timestamp') html += `<th>${key}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        preview.forEach(row => {
            html += '<tr>';
            Object.entries(row).forEach(([key, value]) => {
                if (key !== 'timestamp') {
                    // Format numbers to 2 decimal places
                    if (typeof value === 'number') {
                        value = value.toFixed(2);
                    }
                    html += `<td>${value}</td>`;
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        
        previewTable.innerHTML = html;
        document.getElementById('dataPreview').style.display = 'block';
    }

    populateStoreSelect() {
        const storeSelect = document.getElementById('storeSelect');
        const chartSelect = document.getElementById('storeChartSelect');
        
        storeSelect.innerHTML = '';
        chartSelect.innerHTML = '<option value="">Select a store...</option>';
        
        const stores = this.dataLoader.getAllStores();
        console.log('Available stores:', stores);
        
        stores.forEach(storeId => {
            const option1 = document.createElement('option');
            option1.value = storeId;
            option1.textContent = `Store ${storeId}`;
            storeSelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = storeId;
            option2.textContent = `Store ${storeId}`;
            chartSelect.appendChild(option2);
        });

        // Select first few stores by default for demo
        if (stores.length > 0) {
            const defaultStores = stores.slice(0, Math.min(3, stores.length));
            defaultStores.forEach(storeId => {
                const option = Array.from(storeSelect.options).find(opt => parseInt(opt.value) === storeId);
                if (option) option.selected = true;
            });
            this.updateSelectedStores();
        }
    }

    updateSelectedStores() {
        const selectedOptions = Array.from(document.getElementById('storeSelect').selectedOptions);
        this.selectedStores = selectedOptions.map(option => parseInt(option.value));
        console.log('Selected stores:', this.selectedStores);
    }

    async trainModel() {
        this.updateSelectedStores();
        
        if (this.selectedStores.length === 0) {
            alert('Please select at least one store');
            return;
        }

        const windowSize = parseInt(document.getElementById('windowSize').value);
        const trainSplit = parseInt(document.getElementById('trainSplit').value) / 100;
        const lstmLayers = parseInt(document.getElementById('lstmLayers').value);
        const hiddenUnits = parseInt(document.getElementById('hiddenUnits').value);
        const learningRate = parseFloat(document.getElementById('learningRate').value);
        const epochs = parseInt(document.getElementById('epochs').value);

        console.log('Training parameters:', {
            windowSize, trainSplit, lstmLayers, hiddenUnits, learningRate, epochs
        });

        try {
            // Prepare data
            this.trainingData = this.dataLoader.prepareSequences(
                this.selectedStores, 
                windowSize, 
                trainSplit
            );

            console.log('Training data prepared:', {
                trainSamples: this.trainingData.trainX.length,
                testSamples: this.trainingData.testX.length,
                features: this.trainingData.featureNames
            });

            if (this.trainingData.trainX.length === 0) {
                alert('Not enough data for training. Try selecting more stores or reducing window size.');
                return;
            }

            // Create model
            const inputShape = [windowSize, this.trainingData.featureNames.length];
            await this.lstm.createModel(inputShape, lstmLayers, hiddenUnits, learningRate);

            // Show progress
            document.getElementById('trainingProgress').style.display = 'block';
            document.getElementById('trainBtn').disabled = true;
            document.getElementById('testBtn').disabled = true;

            // Reset charts
            this.lossChart.data.labels = [];
            this.lossChart.data.datasets[0].data = [];
            this.lossChart.data.datasets[1].data = [];
            this.lossChart.update();

            // Train model
            await this.lstm.trainModel(
                this.trainingData.trainX,
                this.trainingData.trainY,
                epochs,
                0.1,
                (epoch, totalEpochs, loss, valLoss) => {
                    const progress = (epoch / totalEpochs) * 100;
                    document.getElementById('progressFill').style.width = progress + '%';
                    document.getElementById('progressText').textContent = 
                        `Epoch: ${epoch}/${totalEpochs} - Loss: ${loss.toFixed(6)}`;
                    
                    // Update loss chart
                    this.lossChart.data.labels.push(epoch);
                    this.lossChart.data.datasets[0].data.push(loss);
                    this.lossChart.data.datasets[1].data.push(valLoss || loss);
                    this.lossChart.update();
                }
            );

            document.getElementById('trainBtn').disabled = false;
            document.getElementById('testBtn').disabled = false;
            alert('✅ Model training completed!');
            
        } catch (error) {
            console.error('Training error:', error);
            alert('❌ Error training model: ' + error.message);
            document.getElementById('trainBtn').disabled = false;
            document.getElementById('testBtn').disabled = false;
        }
    }

    async testModel() {
        if (!this.trainingData || !this.lstm.model) {
            alert('Please train the model first');
            return;
        }

        try {
            document.getElementById('testBtn').disabled = true;
            document.getElementById('testBtn').textContent = 'Testing...';
            
            const predictions = await this.lstm.predict(this.trainingData.testX);
            this.testResults = await this.lstm.evaluateByStore(
                predictions,
                this.trainingData.testY,
                this.trainingData.storeIndices
            );

            console.log('Test results:', this.testResults);
            this.updateRMSEChart();
            document.getElementById('exportBtn').disabled = false;
            
            document.getElementById('testBtn').disabled = false;
            document.getElementById('testBtn').textContent = '🧪 Test Model';
            
            alert('✅ Model testing completed!');
        } catch (error) {
            console.error('Testing error:', error);
            alert('❌ Error testing model: ' + error.message);
            document.getElementById('testBtn').disabled = false;
            document.getElementById('testBtn').textContent = '🧪 Test Model';
        }
    }

    updateRMSEChart() {
        if (!this.testResults) return;

        // Get top 10 stores by RMSE (worst performers)
        const topStores = Object.entries(this.testResults)
            .sort(([, a], [, b]) => b.rmse - a.rmse)
            .slice(0, 10);

        this.rmseChart.data.labels = topStores.map(([storeId]) => `Store ${storeId}`);
        this.rmseChart.data.datasets[0].data = topStores.map(([, data]) => data.rmse);
        this.rmseChart.update();

        console.log('Top 10 stores by RMSE:', topStores);
    }

    updatePredictionChart(storeId) {
        if (!this.testResults || !storeId || !this.testResults[storeId]) {
            // Clear chart if no data
            this.predictionChart.data.datasets[0].data = [];
            this.predictionChart.data.datasets[1].data = [];
            this.predictionChart.update();
            return;
        }

        const storeData = this.testResults[storeId];
        
        // Use the first prediction/actual pair for demonstration
        if (storeData.actuals.length > 0 && storeData.predictions.length > 0) {
            // Denormalize sales data (multiply by 1,000,000)
            const actualSales = storeData.actuals[0].map(val => val * 1000000);
            const predictedSales = storeData.predictions[0].map(val => val * 1000000);
            
            this.predictionChart.data.datasets[0].data = actualSales;
            this.predictionChart.data.datasets[1].data = predictedSales;
            this.predictionChart.update();
        }
    }

    exportResults() {
        if (!this.testResults) {
            alert('No results to export');
            return;
        }

        let csvContent = 'Store,RMSE,Predictions (3 weeks)\n';
        Object.entries(this.testResults).forEach(([storeId, data]) => {
            const predictionsStr = data.predictions.map(pred => 
                pred.map(val => (val * 1000000).toFixed(2)).join(';')
            ).join('|');
            csvContent += `${storeId},${data.rmse.toFixed(6)},"${predictionsStr}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales_forecast_results_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

// Initialize app when page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SalesForecastingApp();
});
