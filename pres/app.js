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

        // Model controls
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
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Validation Loss',
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        data: [],
                        fill: true,
                        tension: 0.4
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
                        pointRadius: 6,
                        tension: 0.4
                    },
                    {
                        label: 'Predicted Sales',
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        data: [],
                        borderWidth: 2,
                        pointRadius: 6,
                        borderDash: [5, 5],
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Sales ($)' },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    async handleFileUpload(file) {
        try {
            document.getElementById('fileUpload').innerHTML = '<p>📊 Loading data...</p>';
            
            const data = await this.dataLoader.loadCSV(file);
            this.showDataPreview();
            this.populateStoreSelect();
            
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
            document.getElementById('fileUpload').addEventListener('click', () => document.getElementById('fileInput').click());
        }
    }

    showDataPreview() {
        const preview = this.dataLoader.getDataPreview(10);
        const previewTable = document.getElementById('previewTable');
        
        let html = '<table><thead><tr>';
        Object.keys(preview[0] || {}).forEach(key => {
            if (key !== 'timestamp') html += `<th>${key}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        preview.forEach(row => {
            html += '<tr>';
            Object.entries(row).forEach(([key, value]) => {
                if (key !== 'timestamp') {
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

        // 🔥 ФИКС: Выбираем больше магазинов по умолчанию
        const defaultStores = stores.slice(0, Math.min(8, stores.length));
        defaultStores.forEach(storeId => {
            const option = Array.from(storeSelect.options).find(opt => parseInt(opt.value) === storeId);
            if (option) option.selected = true;
        });
        this.updateSelectedStores();
        
        console.log('Default selected stores:', defaultStores);
    }

    updateSelectedStores() {
        const selectedOptions = Array.from(document.getElementById('storeSelect').selectedOptions);
        this.selectedStores = selectedOptions.map(option => parseInt(option.value));
        console.log('Currently selected stores:', this.selectedStores);
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

        try {
            // Prepare data
            this.trainingData = this.dataLoader.prepareSequences(
                this.selectedStores, 
                windowSize, 
                trainSplit
            );

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
            
            console.log('Test data info:', {
                testSamples: this.trainingData.testX.length,
                storesInTest: [...new Set(this.trainingData.storeIndices)],
                storeDistribution: this.countStores(this.trainingData.storeIndices)
            });
            
            const predictions = await this.lstm.predict(this.trainingData.testX);
            this.testResults = await this.lstm.evaluateByStore(
                predictions,
                this.trainingData.testY,
                this.trainingData.storeIndices
            );

            console.log('Test results stores:', Object.keys(this.testResults));
            
            this.updateRMSEChart();
            document.getElementById('exportBtn').disabled = false;
            
            document.getElementById('testBtn').disabled = false;
            document.getElementById('testBtn').textContent = '🧪 Test Model';
            
            alert(`✅ Model testing completed! Evaluated ${Object.keys(this.testResults).length} stores`);
        } catch (error) {
            console.error('Testing error:', error);
            alert('❌ Error testing model: ' + error.message);
            document.getElementById('testBtn').disabled = false;
            document.getElementById('testBtn').textContent = '🧪 Test Model';
        }
    }

    updateRMSEChart() {
        if (!this.testResults) return;

        // 🔥 ФИКС: Показываем все магазины из результатов
        const allStores = Object.entries(this.testResults)
            .sort(([, a], [, b]) => b.rmse - a.rmse);

        // Ограничиваем максимум 10 магазинами для читаемости
        const displayStores = allStores.slice(0, Math.min(10, allStores.length));
        
        this.rmseChart.data.labels = displayStores.map(([storeId]) => `Store ${storeId}`);
        this.rmseChart.data.datasets[0].data = displayStores.map(([, data]) => data.rmse);
        this.rmseChart.update();

        console.log('All stores in results:', allStores.map(([storeId]) => storeId));
        console.log('RMSE values:', allStores.map(([, data]) => data.rmse));
    }

    updatePredictionChart(storeId) {
        if (!this.testResults || !storeId || !this.testResults[storeId]) {
            this.predictionChart.data.datasets[0].data = [];
            this.predictionChart.data.datasets[1].data = [];
            this.predictionChart.update();
            return;
        }

        const storeData = this.testResults[storeId];
        
        if (storeData.actuals.length > 0 && storeData.predictions.length > 0) {
            // Денормализация данных продаж
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

        let csvContent = 'Store,RMSE\n';
        Object.entries(this.testResults).forEach(([storeId, data]) => {
            csvContent += `${storeId},${data.rmse.toFixed(6)}\n`;
        });

        const blob = new Blob([csvContent
