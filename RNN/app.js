import DataLoader from './data-loader.js';
import GRUModel from './gru.js';

class StockPredictionApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.model = null;
        this.currentPredictions = null;
        this.accuracyChart = null;
        this.confusionChart = null;
        this.isTraining = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('csvFile');
        const trainBtn = document.getElementById('trainBtn');
        const predictBtn = document.getElementById('predictBtn');
        const horizonSelect = document.getElementById('predictionHorizon');
        const sequenceSelect = document.getElementById('sequenceLength');

        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        trainBtn.addEventListener('click', () => this.trainModel());
        predictBtn.addEventListener('click', () => this.runPrediction());
        
        if (horizonSelect) {
            horizonSelect.addEventListener('change', () => this.updateParameters());
        }
        if (sequenceSelect) {
            sequenceSelect.addEventListener('change', () => this.updateParameters());
        }
    }

    updateParameters() {
        const horizon = parseInt(document.getElementById('predictionHorizon').value) || 3;
        const sequenceLength = parseInt(document.getElementById('sequenceLength').value) || 20;
        
        console.log(`Updated parameters: horizon=${horizon}, sequenceLength=${sequenceLength}`);
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            document.getElementById('status').textContent = 'Loading CSV...';
            await this.dataLoader.loadCSV(file);
            
            document.getElementById('status').textContent = 'Preprocessing data...';
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
        document.getElementById('trainBtn').disabled = true;
        document.getElementById('predictBtn').disabled = true;

        try {
            const horizon = parseInt(document.getElementById('predictionHorizon').value) || 3;
            const sequenceLength = parseInt(document.getElementById('sequenceLength').value) || 20;
            
            // Recreate sequences with new parameters
            this.dataLoader.createSequences(sequenceLength, horizon);
            
            const { X_train, y_train, X_test, y_test, symbols } = this.dataLoader;
            const featureCount = 8; // Based on enhanced features
            
            this.model = new GRUModel(
                [sequenceLength, symbols.length * featureCount], 
                symbols.length * horizon * 3 // 3 classes per prediction
            );
            
            document.getElementById('status').textContent = 'Training model...';
            await this.model.train(X_train, y_train, X_test, y_test, 100, 32);
            
            document.getElementById('predictBtn').disabled = false;
            document.getElementById('status').textContent = 'Training completed. Click Run Prediction to evaluate.';
            
        } catch (error) {
            document.getElementById('status').textContent = `Training error: ${error.message}`;
            console.error(error);
        } finally {
            this.isTraining = false;
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
            this.visualizeResults(evaluation, symbols);
            
            document.getElementById('status').textContent = 'Prediction completed. Results displayed below.';
            
            // Clean up tensors
            predictions.dispose();
            
        } catch (error) {
            document.getElementById('status').textContent = `Prediction error: ${error.message}`;
            console.error(error);
        }
    }

    visualizeResults(evaluation, symbols) {
        this.createAccuracyChart(evaluation.stockMetrics, symbols);
        this.createConfusionMatrix(evaluation.confusionMatrices, symbols[0], evaluation.classNames);
        this.createDetailedMetricsChart(evaluation.stockMetrics, symbols);
        this.createTimelineCharts(evaluation.stockPredictions, symbols);
    }

    createAccuracyChart(metrics, symbols) {
        const ctx = document.getElementById('accuracyChart').getContext('2d');
        
        // Sort stocks by accuracy
        const sortedEntries = Object.entries(metrics)
            .sort(([,a], [,b]) => b.accuracy - a.accuracy);
        
        const sortedSymbols = sortedEntries.map(([symbol]) => symbol);
        const sortedAccuracies = sortedEntries.map(([, metric]) => metric.accuracy * 100);

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
                    backgroundColor: sortedAccuracies.map(acc => 
                        acc > 60 ? 'rgba(75, 192, 192, 0.8)' : 
                        acc > 45 ? 'rgba(255, 205, 86, 0.8)' : 
                        'rgba(255, 99, 132, 0.8)'
                    ),
                    borderColor: sortedAccuracies.map(acc => 
                        acc > 60 ? 'rgb(75, 192, 192)' : 
                        acc > 45 ? 'rgb(255, 205, 86)' : 
                        'rgb(255, 99, 132)'
                    ),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Accuracy (%)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const symbol = sortedSymbols[context.dataIndex];
                                const metric = metrics[symbol];
                                return [
                                    `Accuracy: ${context.raw.toFixed(2)}%`,
                                    `Precision: ${(metric.precision.reduce((a, b) => a + b) / 3 * 100).toFixed(2)}%`,
                                    `Recall: ${(metric.recall.reduce((a, b) => a + b) / 3 * 100).toFixed(2)}%`
                                ];
                            }
                        }
                    }
                }
            }
        });
    }

    createConfusionMatrix(confusionMatrices, symbol, classNames) {
        const ctx = document.getElementById('confusionChart').getContext('2d');
        const matrix = confusionMatrices[symbol];
        
        if (this.confusionChart) {
            this.confusionChart.destroy();
        }

        const data = {
            labels: classNames,
            datasets: [{
                label: 'Confusion Matrix',
                data: matrix.flat(),
                backgroundColor: matrix.flat().map(value => {
                    const maxVal = Math.max(...matrix.flat());
                    const opacity = value / maxVal * 0.8;
                    return `rgba(54, 162, 235, ${opacity})`;
                }),
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        };

        this.confusionChart = new Chart(ctx, {
            type: 'bar',
            data: data,
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: `Confusion Matrix - ${symbol}`
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const row = Math.floor(context.dataIndex / 3);
                                const col = context.dataIndex % 3;
                                return `True: ${classNames[row]}, Pred: ${classNames[col]}, Count: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Predicted'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Actual'
                        }
                    }
                }
            }
        });
    }

    createDetailedMetricsChart(metrics, symbols) {
        const ctx = document.getElementById('metricsChart').getContext('2d');
        const topSymbols = Object.entries(metrics)
            .sort(([,a], [,b]) => b.accuracy - a.accuracy)
            .slice(0, 5)
            .map(([symbol]) => symbol);

        const datasets = [
            {
                label: 'Accuracy',
                data: topSymbols.map(symbol => metrics[symbol].accuracy * 100),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)'
            },
            {
                label: 'Average Precision',
                data: topSymbols.map(symbol => 
                    metrics[symbol].precision.reduce((a, b) => a + b) / 3 * 100
                ),
                borderColor: 'rgb(255, 159, 64)',
                backgroundColor: 'rgba(255, 159, 64, 0.2)'
            },
            {
                label: 'Average Recall',
                data: topSymbols.map(symbol => 
                    metrics[symbol].recall.reduce((a, b) => a + b) / 3 * 100
                ),
                borderColor: 'rgb(153, 102, 255)',
                backgroundColor: 'rgba(153, 102, 255, 0.2)'
            }
        ];

        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: topSymbols,
                datasets: datasets
            },
            options: {
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    createTimelineCharts(predictions, symbols) {
        const container = document.getElementById('timelineContainer');
        container.innerHTML = '';

        // Show top 3 stocks by accuracy for timeline visualization
        const topStocks = Object.keys(predictions).slice(0, 3);

        topStocks.forEach(symbol => {
            const stockPredictions = predictions[symbol];
            const chartContainer = document.createElement('div');
            chartContainer.className = 'stock-chart';
            chartContainer.innerHTML = `
                <h4>${symbol} Prediction Timeline</h4>
                <div class="prediction-stats">
                    <span>Accuracy: ${(stockPredictions.filter(p => p.correct).length / stockPredictions.length * 100).toFixed(2)}%</span>
                </div>
                <canvas id="timeline-${symbol}"></canvas>
            `;
            container.appendChild(chartContainer);

            const ctx = document.getElementById(`timeline-${symbol}`).getContext('2d');
            
            // Sample first 50 predictions for cleaner visualization
            const sampleSize = Math.min(50, stockPredictions.length);
            const sampleData = stockPredictions.slice(0, sampleSize);
            
            const correctData = sampleData.map(p => p.correct ? 1 : 0);
            const confidenceData = sampleData.map(p => p.confidence);
            const labels = sampleData.map((_, i) => `Pred ${i + 1}`);

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Correct Predictions',
                            data: correctData,
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            fill: true,
                            tension: 0.4,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Confidence',
                            data: confidenceData,
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            fill: false,
                            tension: 0.4,
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
                            min: 0,
                            max: 1,
                            ticks: {
                                callback: (value) => value === 1 ? 'Correct' : value === 0 ? 'Wrong' : ''
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            min: 0,
                            max: 1,
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const pred = sampleData[context.dataIndex];
                                    if (context.datasetIndex === 0) {
                                        return `Correct: ${pred.correct ? 'Yes' : 'No'}`;
                                    } else {
                                        return `Confidence: ${(pred.confidence * 100).toFixed(2)}%`;
                                    }
                                }
                            }
                        }
                    }
                }
            });
        });
    }

    dispose() {
        if (this.dataLoader) this.dataLoader.dispose();
        if (this.model) this.model.dispose();
        if (this.accuracyChart) this.accuracyChart.destroy();
        if (this.confusionChart) this.confusionChart.destroy();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StockPredictionApp();
});
