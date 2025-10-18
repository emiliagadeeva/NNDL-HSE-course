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
        // File upload - ПРАВИЛЬНАЯ ИНИЦИАЛИЗАЦИЯ
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
                if (files[0].type === 'text/csv') {
                    this.handleFileUpload(files[0]);
                } else {
                    alert('Please upload a CSV file');
                }
            }
        });
        
        // Обработчик выбора файла
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                if (e.target.files[0].type === 'text/csv') {
                    this.handleFileUpload(e.target.files[0]);
                } else {
                    alert('Please upload a CSV file');
                }
            }
        });

        // 🔥 ПРАВИЛЬНЫЕ ОБРАБОТЧИКИ СЛАЙДЕРОВ
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

        // Инициализация значений слайдеров при загрузке
        document.getElementById('windowSizeValue').textContent = windowSizeSlider.value;
        document.getElementById('trainSplitValue').textContent = trainSplitSlider.value + '%';

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
            console.log('Starting file upload...');
            document.getElementById('fileUpload').innerHTML = '<p>📊 Loading data...</p>';
            
            const data = await this.dataLoader.loadCSV(file);
            console.log('Data loaded successfully');
            
            this.showDataPreview();
            this.populateStoreSelect();
            
            // Восстанавливаем оригинальный HTML
            document.getElementById('fileUpload').innerHTML = `
                <p>✅ Data loaded successfully!</p>
                <p>📁 Drag & drop another CSV file here or click to select</p>
                <input type="file" id="fileInput" accept=".csv" style="display: none;">
            `;
            
            // 🔥 ПРАВИЛЬНОЕ ПЕРЕПОДКЛЮЧЕНИЕ СОБЫТИЙ
            this.reattachFileUploadListeners();
            
            document.getElementById('trainBtn').disabled = false;
            console.log('File upload completed successfully');
            
        } catch (error) {
            console.error('Error loading file:', error);
            document.getElementById('fileUpload').innerHTML = `
                <p>❌ Error loading file: ${error.message}</p>
                <p>📁 Drag & drop CSV file here or click to select</p>
                <input type="file" id="fileInput" accept=".csv" style="display: none;">
            `;
            this.reattachFileUploadListeners();
        }
    }

    // 🔥 НОВЫЙ МЕТОД: Переподключение событий после изменения HTML
    reattachFileUploadListeners() {
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('fileInput');
        
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
                if (files[0].type === 'text/csv') {
                    this.handleFileUpload(files[0]);
                } else {
                    alert('Please upload a CSV file');
                }
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                if (e.target.files[0].type === 'text/csv') {
                    this.handleFileUpload(e.target.files[0]);
                } else {
                    alert('Please upload a CSV file');
                }
            }
        });
    }

    showDataPreview() {
        const preview = this.dataLoader.getDataPreview(10);
        const previewTable = document.getElementById('previewTable');
        
        if (preview.length === 0) {
            previewTable.innerHTML = '<p>No data available</p>';
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

        // Выбираем больше магазинов по умолчанию
        const defaultStores = stores.slice(0, Math.min(5, stores.length));
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

        // Рассчитываем разделение на train/val/test
        const trainRatio = trainSplit;
        const valRatio = 0.15; // Фиксированное значение для валидации
        const testRatio = 1 - trainRatio - valRatio;

        console.log('Training with params:', {
            windowSize, trainRatio, valRatio, testRatio, lstmLayers, hiddenUnits, learningRate, epochs
        });

        try {
            // Prepare data с правильным разделением
            this.trainingData = this.dataLoader.prepareSequences(
                this.selectedStores, 
                windowSize, 
                trainRatio,
                valRatio
            );

            if (this.trainingData.trainX.length === 0) {
                alert('Not enough data for training. Try selecting more stores or reducing window size.');
                return;
            }

            // 🔥 ИСПРАВЛЕНИЕ: Проверяем, есть ли validation данные
            if (this.trainingData.valX.length === 0) {
                console.warn('No validation data available, using training data for validation');
                // Если
