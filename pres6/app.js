[file name]: app.js
[file content begin]
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
        // 🔥 ПРАВИЛЬНАЯ ИНИЦИАЛИЗАЦИЯ ЗАГРУЗКИ ФАЙЛОВ
        this.initializeFileUpload();
        
        // 🔥 ПРАВИЛЬНЫЕ ОБРАБОТЧИКИ СЛАЙДЕРОВ
        this.initializeSliders();
        
        // Кнопки управления
        document.getElementById('trainBtn').addEventListener('click', () => this.trainModel());
        document.getElementById('testBtn').addEventListener('click', () => this.testModel());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportResults());
        
        // Выбор магазина для графика
        document.getElementById('storeChartSelect').addEventListener('change', (e) => {
            this.updatePredictionChart(e.target.value);
        });

        // Выбор магазинов для обучения
        document.getElementById('storeSelect').addEventListener('change', (e) => {
            this.updateSelectedStores();
        });
    }

    initializeFileUpload() {
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('fileInput');
        
        // Обработчики для drag & drop
        fileUpload.addEventListener('click', () => {
            fileInput.click();
        });
        
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
        
        // Обработчик выбора файла
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });
    }

    initializeSliders() {
        const windowSizeSlider = document.getElementById('windowSize');
        const trainSplitSlider = document.getElementById('trainSplit');
        
        // Слайдер размера окна
        windowSizeSlider.addEventListener('input', (e) => {
            document.getElementById('windowSizeValue').textContent = e.target.value;
        });
        
        // Слайдер разделения train/test
        trainSplitSlider.addEventListener('input', (e) => {
            document.getElementById('trainSplitValue').textContent = e.target.value + '%';
        });

        // Инициализация значений слайдеров
        document.getElementById('windowSizeValue').textContent = windowSizeSlider.value;
        document.getElementById('trainSplitValue').textContent = trainSplitSlider.value + '%';
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

        // 🔥 НОВЫЕ ГРАФИКИ ДЛЯ EDA
        this.initializeEDACharts();
    }

    initializeEDACharts() {
        // Sales by Store chart
        this.salesByStoreChart = new Chart(document.getElementById('salesByStoreChart'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Total Sales',
                    backgroundColor: '#007bff',
                    borderColor: '#0056b3',
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
                        title: { display: true, text: 'Total Sales ($)' },
                        ticks: {
                            callback: function(value) {
                                return '$' + (value / 1000000).toFixed(1) + 'M';
                            }
                        }
                    },
                    x: {
                        title: { display: true, text: 'Store' }
                    }
                }
            }
        });

        // Sales Distribution chart
        this.salesDistributionChart = new Chart(document.getElementById('salesDistributionChart'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Frequency',
                    backgroundColor: '#28a745',
                    borderColor: '#1e7e34',
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
                        title: { display: true, text: 'Frequency' }
                    },
                    x: {
                        title: { display: true, text: 'Sales Range' }
                    }
                }
            }
        });

        // Holiday Sales chart
        this.holidaySalesChart = new Chart(document.getElementById('holidaySalesChart'), {
            type: 'bar',
            data: {
                labels: ['Holiday Weeks', 'Non-Holiday Weeks'],
                datasets: [{
                    label: 'Average Sales',
                    backgroundColor: ['#ff6b6b', '#4ecdc4'],
                    borderColor: ['#fa5252', '#2b9c94'],
                    borderWidth: 1,
                    data: [0, 0]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Average Sales ($)' },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });

        // Sales Trend chart
        this.salesTrendChart = new Chart(document.getElementById('salesTrendChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Average Monthly Sales',
                    borderColor: '#6f42c1',
                    backgroundColor: 'rgba(111, 66, 193, 0.1)',
                    data: [],
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Average Sales ($)' },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        title: { display: true, text: 'Month' }
                    }
                }
            }
        });

        // Correlation chart
        this.correlationChart = new Chart(document.getElementById('correlationChart'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: -1,
                        max: 1,
                        title: { display: true, text: 'Correlation Coefficient' }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    }
                }
            }
        });
    }

    async handleFileUpload(file) {
        try {
            console.log('Starting file upload...');
            
            // Проверяем тип файла
            if (!file.name.toLowerCase().endsWith('.csv')) {
                alert('Please upload a CSV file');
                return;
            }

            document.getElementById('fileUpload').innerHTML = '<p>📊 Loading data...</p>';
            
            const data = await this.dataLoader.loadCSV(file);
            console.log('Data loaded successfully');
            
            this.showDataPreview();
            this.populateStoreSelect();
            this.performEDA();
            
            // Восстанавливаем оригинальный HTML
            document.getElementById('fileUpload').innerHTML = `
                <p>✅ Data loaded successfully!</p>
                <p>📁 Drag & drop another CSV file here or click to select</p>
                <input type="file" id="fileInput" accept=".csv" style="display: none;">
            `;
            
            // Переподключаем обработчики
            this.initializeFileUpload();
            
        } catch (error) {
            console.error('Error loading file:', error);
            document.getElementById('fileUpload').innerHTML = `
                <p>❌ Error loading file: ${error.message}</p>
                <p>📁 Drag & drop CSV file here or click to select</p>
                <input type="file" id="fileInput" accept=".csv" style="display: none;">
            `;
            this.initializeFileUpload();
        }
    }

    showDataPreview() {
        const preview = this.dataLoader.getDataPreview(5);
        const previewTable = document.getElementById('previewTable');
        
        if (preview.length === 0) {
            previewTable.innerHTML = '<p>No data to display</p>';
            return;
        }
        
        const headers = Object.keys(preview[0]).filter(key => key !== 'timestamp');
        let html = '<table><thead><tr>';
        
        headers.forEach(header => {
            html += `<th>${header}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        preview.forEach(row => {
            html += '<tr>';
            headers.forEach(header => {
                let value = row[header];
                if (typeof value === 'number') {
                    if (header === 'Weekly_Sales') {
                        value = '$' + Math.round(value).toLocaleString();
                    } else {
                        value = value.toFixed(2);
                    }
                }
                html += `<td>${value}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        previewTable.innerHTML = html;
        
        document.getElementById('dataPreview').style.display = 'block';
        document.getElementById('trainBtn').disabled = false;
    }

    populateStoreSelect() {
        const storeSelect = document.getElementById('storeSelect');
        const storeChartSelect = document.getElementById('storeChartSelect');
        const stores = this.dataLoader.getAllStores();
        
        storeSelect.innerHTML = '';
        storeChartSelect.innerHTML = '<option value="">Select a store...</option>';
        
        stores.forEach(store => {
            const option1 = document.createElement('option');
            option1.value = store;
            option1.textContent = `Store ${store}`;
            storeSelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = store;
            option2.textContent = `Store ${store}`;
            storeChartSelect.appendChild(option2);
        });
        
        // Автоматически выбираем первые 5 магазинов
        const selectedStores = stores.slice(0, Math.min(5, stores.length));
        selectedStores.forEach(store => {
            const option = storeSelect.querySelector(`option[value="${store}"]`);
            if (option) option.selected = true;
        });
        this.selectedStores = selectedStores;
    }

    updateSelectedStores() {
        const storeSelect = document.getElementById('storeSelect');
        this.selectedStores = Array.from(storeSelect.selectedOptions).map(option => parseInt(option.value));
        console.log('Selected stores:', this.selectedStores);
    }

    // 🔥 НОВЫЙ МЕТОД: ВЫПОЛНЕНИЕ EDA
    performEDA() {
        const stats = this.dataLoader.getEDAStats();
        if (!stats) return;

        // Обновляем статистику
        this.updateStatsGrid(stats);
        
        // Обновляем графики EDA
        this.updateEDACharts(stats);
        
        // Показываем контейнер EDA
        document.getElementById('edaContainer').style.display = 'block';
    }

    updateStatsGrid(stats) {
        const statsGrid = document.getElementById('statsGrid');
        
        const statCards = [
            { label: 'Total Stores', value: stats.totalStores, format: 'number' },
            { label: 'Total Records', value: stats.totalRecords, format: 'number' },
            { label: 'Date Range', value: `${stats.dateRange.start} to ${stats.dateRange.end}`, format: 'string' },
            { label: 'Total Weeks', value: stats.dateRange.weeks, format: 'number' },
            { label: 'Total Sales', value: stats.salesStats.total, format: 'currency' },
            { label: 'Average Sales', value: stats.salesStats.average, format: 'currency' },
            { label: 'Max Sales', value: stats.salesStats.max, format: 'currency' },
            { label: 'Min Sales', value: stats.salesStats.min, format: 'currency' },
            { label: 'Holiday Weeks', value: stats.holidayStats.holidayWeeks, format: 'number' },
            { label: 'Non-Holiday Weeks', value: stats.holidayStats.nonHolidayWeeks, format: 'number' }
        ];

        let html = '';
        statCards.forEach(stat => {
            let displayValue = stat.value;
            if (stat.format === 'currency') {
                displayValue = '$' + Math.round(stat.value).toLocaleString();
            } else if (stat.format === 'number') {
                displayValue = stat.value.toLocaleString();
            }
            
            html += `
                <div class="stat-card">
                    <div class="stat-value">${displayValue}</div>
                    <div class="stat-label">${stat.label}</div>
                </div>
            `;
        });
        
        statsGrid.innerHTML = html;
    }

    updateEDACharts(stats) {
        // Sales by Store
        const salesByStore = this.dataLoader.getSalesByStore();
        const storeLabels = Object.keys(salesByStore).sort((a, b) => a - b);
        const storeSales = storeLabels.map(storeId => salesByStore[storeId]);
        
        this.salesByStoreChart.data.labels = storeLabels.map(id => `Store ${id}`);
        this.salesByStoreChart.data.datasets[0].data = storeSales;
        this.salesByStoreChart.update();

        // Sales Distribution
        const salesDist = this.dataLoader.getSalesDistribution();
        this.salesDistributionChart.data.labels = salesDist.labels;
        this.salesDistributionChart.data.datasets[0].data = salesDist.data;
        this.salesDistributionChart.update();

        // Holiday Sales
        this.holidaySalesChart.data.datasets[0].data = [
            stats.holidayStats.avgHolidaySales,
            stats.holidayStats.avgNonHolidaySales
        ];
        this.holidaySalesChart.update();

        // Sales Trend
        const salesTrend = this.dataLoader.getSalesTrend();
        this.salesTrendChart.data.labels = salesTrend.labels;
        this.salesTrendChart.data.datasets[0].data = salesTrend.data;
        this.salesTrendChart.update();

        // Correlation Matrix
        const correlationData = this.dataLoader.getCorrelationData();
        this.correlationChart.data.labels = correlationData.labels;
        this.correlationChart.data.datasets = correlationData.datasets;
        this.correlationChart.update();
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

        console.log('Training with params:', {
            windowSize, trainSplit, lstmLayers, hiddenUnits, learningRate, epochs
        });

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

        const allStores = Object.entries(this.testResults)
            .sort(([, a], [, b]) => b.rmse - a.rmse);

        const displayStores = allStores.slice(0, Math.min(10, allStores.length));
        
        this.rmseChart.data.labels = displayStores.map(([storeId]) => `Store ${storeId}`);
        this.rmseChart.data.datasets[0].data = displayStores.map(([, data]) => data.rmse);
        this.rmseChart.update();

        console.log('All stores in results:', allStores.map(([storeId]) => storeId));
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
            const actualSales = storeData.actuals[0].map(val => val * 1000000);
            const predictedSales = storeData.predictions[0].map(val => val * 1000000);
            
            this.predictionChart.data.datasets[0].data = actualSales;
            this.predictionChart.data.datasets[1].data = predictedSales;
            this.predictionChart.update();
        }
    }

    countStores(storeIndices) {
        const count = {};
        storeIndices.forEach(storeId => {
            count[storeId] = (count[storeId] || 0) + 1;
        });
        return count;
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

// Инициализация приложения
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SalesForecastingApp();
    console.log('Sales Forecasting App initialized');
});
[file content end]
