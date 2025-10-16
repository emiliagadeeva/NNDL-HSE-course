class GRUModel {
    constructor(inputShape, outputSize) {
        this.model = null;
        this.inputShape = inputShape;
        this.outputSize = outputSize;
        this.history = null;
        this.trainingHistory = {
            loss: [],
            accuracy: [],
            val_loss: [],
            val_accuracy: []
        };
    }

    buildModel() {
        // Simplified architecture for browser performance
        this.model = tf.sequential({
            layers: [
                tf.layers.gru({
                    units: 32,
                    returnSequences: false,
                    inputShape: this.inputShape
                }),
                tf.layers.dropout({ rate: 0.2 }),
                
                tf.layers.dense({
                    units: 16,
                    activation: 'relu'
                }),
                
                tf.layers.dense({
                    units: this.outputSize,
                    activation: 'sigmoid'
                })
            ]
        });

        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        console.log('Model built successfully');
        return this.model;
    }

    async train(X_train, y_train, X_test, y_test, epochs = 50, batchSize = 32) {
        if (!this.model) this.buildModel();

        this.trainingHistory = {
            loss: [],
            accuracy: [],
            val_loss: [],
            val_accuracy: []
        };

        try {
            this.history = await this.model.fit(X_train, y_train, {
                epochs: epochs,
                batchSize: batchSize,
                validationData: [X_test, y_test],
                callbacks: {
                    onEpochEnd: async (epoch, logs) => {
                        // Store history for charting
                        this.trainingHistory.loss.push(logs.loss);
                        this.trainingHistory.accuracy.push(logs.acc);
                        this.trainingHistory.val_loss.push(logs.val_loss);
                        this.trainingHistory.val_accuracy.push(logs.val_acc);

                        const progress = ((epoch + 1) / epochs) * 100;
                        const status = `Epoch ${epoch + 1}/${epochs} - loss: ${logs.loss.toFixed(4)}, acc: ${logs.acc.toFixed(4)}, val_loss: ${logs.val_loss.toFixed(4)}, val_acc: ${logs.val_acc.toFixed(4)}`;
                        
                        // Update UI
                        const progressElement = document.getElementById('trainingProgress');
                        const statusElement = document.getElementById('status');
                        if (progressElement) progressElement.value = progress;
                        if (statusElement) statusElement.textContent = status;
                        
                        console.log(status);
                        
                        // Allow UI to update
                        await tf.nextFrame();
                    }
                }
            });

            return this.history;
        } catch (error) {
            console.error('Training error:', error);
            throw error;
        }
    }

    async predict(X) {
        if (!this.model) throw new Error('Model not trained');
        return this.model.predict(X);
    }

    evaluatePerStock(yTrue, yPred, symbols, horizon = 3) {
        const yTrueArray = yTrue.arraySync();
        const yPredArray = yPred.arraySync();
        const numStocks = symbols.length;
        
        const stockAccuracies = {};
        const stockPredictions = {};

        symbols.forEach((symbol, stockIdx) => {
            let correct = 0;
            let total = 0;
            const predictions = [];

            for (let i = 0; i < yTrueArray.length; i++) {
                for (let offset = 0; offset < horizon; offset++) {
                    const targetIdx = stockIdx * horizon + offset;
                    const trueVal = yTrueArray[i][targetIdx];
                    const predVal = yPredArray[i][targetIdx] > 0.5 ? 1 : 0;
                    
                    if (trueVal === predVal) correct++;
                    total++;
                    
                    predictions.push({
                        true: trueVal,
                        pred: predVal,
                        correct: trueVal === predVal
                    });
                }
            }

            stockAccuracies[symbol] = correct / total;
            stockPredictions[symbol] = predictions;
        });

        return { stockAccuracies, stockPredictions };
    }

    getTrainingHistory() {
        return this.trainingHistory;
    }

    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

export default GRUModel;
