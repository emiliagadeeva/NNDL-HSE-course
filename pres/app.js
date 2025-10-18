// app.js
import DataLoader from './data-loader.js';
import SalesPredictor from './gru.js';

class WalmartSalesApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.predictor = new SalesPredictor();
        this.processedData = null;
        this.predictions = null;
        this.charts = {};
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('loadData').addEventListener('click', () => this.loadData());
        document.getElementById('trainModel').addEventListener('click', () => this.trainModel());
        document.getElementById('predict').addEventListener('click', () => this.predict());
    }

    async loadData() {
        const fileInput = document.getElementById('csvFile');
        if (!fileInput.files.length) {
            this.showError('Please select a CSV file');
            return;
        }

        try {
            this.showInfo('Loading and processing CSV data...');
            this.processedData = await this.dataLoader.loadCSV(fileInput.files[0]);
            
            document.getElementById('fileInfo').innerHTML = `
                <p>✅ Data loaded successfully!</p>
                <p>Stores: ${this.processedData.stores.join(', ')}</p>
                <p>Training samples: ${this.processedData.X_train.shape[0]}</p>
                <p>Test samples: ${this.processedData.X_test.shape[0]}</p>
                <p>Sequence length: ${this.processedData.sequenceLength} weeks</p>
                <p>Prediction horizon: ${this.processedData.predictionHorizon} weeks</p>
            `;

            document.getElementById('trainModel').disabled = false;
            this.showInfo('Data ready for training');
            
        } catch (error) {
            this.showError(`Error loading data: ${error.message}`);
        }
    }

    async trainModel() {
        if (!this.processedData) {
            this.showError('Please load data first');
            return;
        }

        try {
            document.getElementById('trainModel').disabled = true;
            this.showInfo('Creating model...');

            // Create model
            this.predictor.createModel(
                this.processedData.sequenceLength,
                this.processedData.featureCount,
                this.processedData.stores.length * this.processedData.predictionHorizon
            );

            this.showInfo('Starting training...');

            // Train model with progress updates
            await this.predictor.train(
                this.processedData.X_train,
                this.processedData.y_train,
                this.processedData.X_test,
                this.processedData.y_test,
                50,
                32,
                (progress) => {
                    const progressBar = document.getElementById('trainingProgress');
                    progressBar.style.width = `${progress.progress}%`;
                    
                    document.getElementById('trainingInfo').innerHTML = `
                        Epoch: ${progress.epoch}/50 | Loss: ${progress.loss.toFixed(4)} | Val Loss: ${progress.valLoss.toFixed(4)}
                    `;
                }
            );

            document.getElementById('predict').disabled = false;
            this.showInfo('✅ Training completed!');
            
        } catch (error) {
            this.showError(`Training failed: ${error.message}`);
            document.getElementById('trainModel').disabled = false;
        }
    }

    async predict() {
        if (!this.predictor.isTrained) {
            this.showError('Please train the model first');
            return;
        }

        try {
            this.showInfo('Making predictions...');
            
            // Make predictions
            const yPred = await this.predictor.predict(this.processedData.X_test);
            const yTrue = this.processedData.y_test;
            
            // Compute overall RMSE
            const overallRMSE = this.predictor.evaluate(yTrue, yPred);
            
            // Compute per-store RMSE
            const perStoreRMSE = this.predictor.computePerStoreRMSE(
                yTrue, 
                yPred, 
                this.processedData.stores.length, 
                this.processedData.predictionHorizon
            );

            this.predictions = { yTrue, yPred, perStoreRMSE, overallRMSE };
            this.displayResults();
            
            // Clean up
            yPred.dispose();
            
        } catch (error) {
            this.showError(`Prediction failed: ${error.message}`);
        }
    }

    displayResults() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `
            <h4>Prediction Results</h4>
            <p><strong>Overall RMSE:</strong> ${this.predictions.overallRMSE.toFixed(2)}</p>
        `;

        this.createRMSEChart();
        this.createTimelineCharts();
    }

    createRMSEChart() {
        const ctx = document.getElementById('rmseChart').getContext('2d');
        
        if (this.charts.rmse) {
            this.charts.rmse.destroy();
        }

        const storeLabels = this.predictions.perStoreRMSE.map(item => `Store ${item.store}`);
        const rmseValues = this.predictions.perStoreRMSE.map(item => item.rmse);

        this.charts.rmse = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: storeLabels,
                datasets: [{
                    label: 'RMSE by Store (Lower is Better)',
                    data: rmseValues,
                    backgroundColor: rmseValues.map(rmse => 
                        rmse < 100000 ? '#4CAF50' : 
                        rmse < 200000 ? '#FFC107' : '#F44336'
                    ),
                    borderColor: '#333',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Store Prediction Performance (RMSE)'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Root Mean Squared Error'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Stores'
                        }
                    }
                }
            }
        });
    }

    createTimelineCharts() {
        const timelinesDiv = document.getElementById('timelines');
        timelinesDiv.innerHTML = '<h4>Prediction Timelines</h4>';

        // Show top 5 stores for demonstration
        const topStores = this.predictions.perStoreRMSE.slice(0, 5);
        
        topStores.forEach(store => {
            const storeDiv = document.createElement('div');
            storeDiv.className = 'timeline-container';
            storeDiv.innerHTML = `<h5>Store ${store.store} (RMSE: ${store.rmse.toFixed(2)})</h5>`;
            
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 200;
            storeDiv.appendChild(canvas);
            timelinesDiv.appendChild(storeDiv);

            this.createStoreTimeline(canvas, store.store);
        });
    }

    createStoreTimeline(canvas, storeId) {
        const ctx = canvas.getContext('2d');
        const sampleSize = Math.min(20, this.processedData.X_test.shape[0]);
        
        // For demonstration, show first few predictions vs actual
        const actualData = [];
        const predictedData = [];

        tf.tidy(() => {
            for (let i = 0; i < sampleSize; i++) {
                const actual = this.predictions.yTrue.slice([i, (storeId-1)*3], [1, 1]).dataSync()[0];
                const predicted = this.predictions.yPred.slice([i, (storeId-1)*3], [1, 1]).dataSync()[0];
                
                actualData.push(actual);
                predictedData.push(predicted);
            }
        });

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({length: sampleSize}, (_, i) => `Week ${i+1}`),
                datasets: [
                    {
                        label: 'Actual Sales',
                        data: actualData,
                        borderColor: '#3366CC',
                        backgroundColor: 'rgba(51, 102, 204, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Predicted Sales',
                        data: predictedData,
                        borderColor: '#FF6384',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        tension: 0.4,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Store ${storeId} - Actual vs Predicted Sales`
                    }
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Weekly Sales'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time (Weeks)'
                        }
                    }
                }
            }
        });
    }

    showInfo(message) {
        console.log('INFO:', message);
    }

    showError(message) {
        console.error('ERROR:', message);
        alert(`Error: ${message}`);
    }

    dispose() {
        this.dataLoader.dispose();
        this.predictor.dispose();
        
        // Clean up charts
        Object.values(this.charts).forEach(chart => {
            if (chart && chart.destroy) {
                chart.destroy();
            }
        });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WalmartSalesApp();
});

export default WalmartSalesApp;
