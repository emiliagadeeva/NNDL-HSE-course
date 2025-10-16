import DataLoader from './data-loader.js';
import GRUModel from './gru.js';

class StockPredictionApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.model = null;
        this.currentPredictions = null;
        this.accuracyChart = null;
        this.trainingChart = null;
        this.isTraining = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('csvFile');
        const trainBtn = document.getElementById('trainBtn');
        const predictBtn = document.getElementById('predictBtn');

        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        trainBtn.addEventListener('click', () => this.trainModel());
        predictBtn.addEventListener('click', () => this.runPrediction());
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            document.getElementById('status').textContent = 'Loading CSV...';
            await this.dataLoader.loadCSV(file);
            
            document.getElementById('status').textContent = 'Preprocessing data...';
            await this.delay(100); // Allow UI to update
            
            this.dataLoader.createSequences();
            
            document.getElementById('trainBtn').disabled = false;
            document.getElementById('status').textContent = 'Data loaded. Click Train Model to begin training.';
            
        } catch (error) {
            document.getElementById('status').textContent = `Error: ${error.message}`;
            console.error(error);
        }
    }

    async trainModel() {
        if (this.isTraining) return;
        
        this.isTraining = true;
        const trainBtn = document.getElementById('trainBtn');
        const predictBtn = document.getElementById('predictBtn');
        
        trainBtn.disabled = true;
        predictBtn.disabled = true;
        trainBtn.textContent = 'Training...';

        try {
            const sequenceLength = parseInt(document.getElementById('sequenceLength').value) || 15;
            const horizon = parseInt(document.getElementById('predictionHorizon').value) || 3;
            
            document.getElementById('status').textContent = 'Creating sequences...';
            await this.delay(100);
            
            this.dataLoader.createSequences(sequenceLength, horizon);
            
            const { X_train, y_train, X_test, y_test, symbols } = this.dataLoader;
            
            document.getElementById('status').textContent = 'Building model...';
            await this.delay(50);

            this.model = new GRUModel(
                [sequenceLength, symbols.length], 
                symbols.length * horizon
            );
            
            document.getElementById('status').textContent = 'Starting training...';
            await this.delay(50);
            
            await this.model.train(X_train, y_train, X_test, y_test, 15, 8);
            
            this.createTrainingChart();
            this.updateModelInfo(symbols, sequenceLength, horizon);
            
            predictBtn.disabled = false;
            trainBtn.textContent = 'Train Model';
            document.getElementById('status').textContent = 'Training completed. Click Run Prediction to evaluate.';
            
        } catch (error) {
            document.getElementById('status').textContent = `Training error: ${error.message}`;
            console.error('Training error:', error);
            trainBtn.textContent = 'Train Model';
        } finally {
            this.isTraining = false;
            trainBtn.disabled = false;
        }
    }

    async runPrediction() {
        if (!this.model) {
            alert('Please train the model first');
            return;
        }

        try {
            document.getElementById('status').textContent = 'Running predictions...';
            const { X_test, y_test, symbols } = this.dataLoader;
            
            const predictions = await this.model.predict(X_test);
            const evaluation = this.model.evaluatePerStock(y_test, predictions, symbols);
            
            this.currentPredictions = evaluation;
            this.createAccuracyChart(evaluation.stockAccuracies, symbols);
            this.createTimelineCharts(evaluation.stockPredictions, symbols);
            
            document.getElementById('status').textContent = 'Prediction completed. Results displayed below.';
            
            predictions.dispose();
            
        } catch (error) {
            document.getElementById('status').textContent = `Prediction error: ${error.message}`;
            console.error(error);
        }
    }

    createAccuracyChart(accuracies, symbols) {
        const ctx = document.getElementById('accuracyChart').getContext('2d');
        
        const sortedEntries = Object.entries(accuracies)
            .sort(([,a], [,b]) => b - a);
        
        const sortedSymbols = sortedEntries.map(([symbol]) => symbol);
        const sortedAccuracies = sortedEntries.map(([, accuracy]) => accuracy * 100);

        if (this.accuracyChart) {
            this.accuracyChart.destroy();
        }

        this.accuracyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedSymbols,
                datasets: [{
                    label: 'Prediction Accuracy (%)',
                    data: sortedAccuracies,
                    backgroundColor: 'rgba(54, 162, 235, 0.8)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Accuracy (%)'
                        }
                    }
                }
            }
        });
    }

    createTrainingChart() {
        const ctx = document.getElementById('trainingChart').getContext('2d');
        const history = this.model.getTrainingHistory();

        if (this.trainingChart) {
            this.trainingChart.destroy();
        }

        this.trainingChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.loss.map((_, i) => i + 1),
                datasets: [
                    {
                        label: 'Training Loss',
                        data: history.loss,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        yAxisID: 'y'
                    },
                    {
                        label: 'Training Accuracy',
                        data: history.accuracy,
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Loss'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        max: 1,
                        title: {
                            display: true,
                            text: 'Accuracy'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
    }

    createTimelineCharts(predictions, symbols) {
        const container = document.getElementById('timelineContainer');
        container.innerHTML = '';

        // Show only first 2 stocks for performance
        const topStocks = Object.keys(predictions).slice(0, 2);

        topStocks.forEach(symbol => {
            const stockPredictions = predictions[symbol];
            const chartContainer = document.createElement('div');
            chartContainer.className = 'stock-chart';
            chartContainer.innerHTML = `<h4>${symbol} Predictions</h4><canvas id="timeline-${symbol}"></canvas>`;
            container.appendChild(chartContainer);

            const ctx = document.getElementById(`timeline-${symbol}`).getContext('2d');
            
            // Sample first 20 predictions
            const sampleSize = Math.min(20, stockPredictions.length);
            const sampleData = stockPredictions.slice(0, sampleSize);
            
            const correctData = sampleData.map(p => p.correct ? 1 : 0);
            const labels = sampleData.map((_, i) => `Pred ${i + 1}`);

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Correct Predictions',
                        data: correctData,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    scales: {
                        y: {
                            min: 0,
                            max: 1,
                            ticks: {
                                callback: (value) => value === 1 ? 'Correct' : value === 0 ? 'Wrong' : ''
                            }
                        }
                    }
                }
            });
        });
    }

    updateModelInfo(symbols, sequenceLength, horizon) {
        const modelInfo = document.getElementById('modelInfo');
        modelInfo.innerHTML = `
            <p><strong>Stocks:</strong> ${symbols.length}</p>
            <p><strong>Sequence Length:</strong> ${sequenceLength} days</p>
            <p><strong>Prediction Horizon:</strong> ${horizon} days</p>
            <p><strong>Model:</strong> GRU with ${symbols.length * horizon} outputs</p>
        `;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    dispose() {
        if (this.dataLoader) this.dataLoader.dispose();
        if (this.model) this.model.dispose();
        if (this.accuracyChart) this.accuracyChart.destroy();
        if (this.trainingChart) this.trainingChart.destroy();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StockPredictionApp();
});
