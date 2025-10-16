class GRUModel {
    constructor(inputShape, outputSize) {
        this.model = null;
        this.inputShape = inputShape;
        this.outputSize = outputSize;
        this.history = null;
        this.classNames = ['Down', 'Neutral', 'Up'];
    }

    buildModel() {
        this.model = tf.sequential({
            layers: [
                tf.layers.gru({
                    units: 128,
                    returnSequences: true,
                    inputShape: this.inputShape,
                    dropout: 0.3,
                    recurrentDropout: 0.2
                }),
                tf.layers.batchNormalization(),
                
                tf.layers.gru({
                    units: 64,
                    returnSequences: true,
                    dropout: 0.3,
                    recurrentDropout: 0.2
                }),
                tf.layers.batchNormalization(),
                
                tf.layers.gru({
                    units: 32,
                    returnSequences: false,
                    dropout: 0.2
                }),
                
                tf.layers.dense({
                    units: 64,
                    activation: 'relu'
                }),
                tf.layers.dropout({ rate: 0.3 }),
                
                tf.layers.dense({
                    units: 32,
                    activation: 'relu'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                
                tf.layers.dense({
                    units: this.outputSize,
                    activation: 'softmax'
                })
            ]
        });

        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'sparseCategoricalCrossentropy',
            metrics: ['accuracy']
        });

        console.log('Model architecture:');
        this.model.summary();

        return this.model;
    }

    async train(X_train, y_train, X_test, y_test, epochs = 100, batchSize = 32) {
        if (!this.model) this.buildModel();

        // Convert y_train and y_test to proper shape for sparse categorical crossentropy
        const yTrainFlat = y_train.reshape([-1]);
        const yTestFlat = y_test.reshape([-1]);

        this.history = await this.model.fit(X_train, yTrainFlat, {
            epochs: epochs,
            batchSize: batchSize,
            validationData: [X_test, yTestFlat],
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    const progress = ((epoch + 1) / epochs) * 100;
                    const status = `Epoch ${epoch + 1}/${epochs} - loss: ${logs.loss.toFixed(4)}, acc: ${logs.acc.toFixed(4)}, val_loss: ${logs.val_loss.toFixed(4)}, val_acc: ${logs.val_acc.toFixed(4)}`;
                    
                    // Update UI
                    const progressElement = document.getElementById('trainingProgress');
                    const statusElement = document.getElementById('status');
                    if (progressElement) progressElement.value = progress;
                    if (statusElement) statusElement.textContent = status;
                    
                    console.log(status);
                    tf.nextFrame();
                },
                onTrainEnd: () => {
                    console.log('Training completed');
                }
            }
        });

        // Clean up
        yTrainFlat.dispose();
        yTestFlat.dispose();

        return this.history;
    }

    async predict(X) {
        if (!this.model) throw new Error('Model not trained');
        const predictions = this.model.predict(X);
        return predictions;
    }

    evaluatePerStock(yTrue, yPred, symbols, horizon = 3) {
        const yTrueArray = yTrue.arraySync();
        const yPredArray = yPred.arraySync();
        const numStocks = symbols.length;
        
        const stockMetrics = {};
        const stockPredictions = {};
        const confusionMatrices = {};

        // Initialize metrics
        symbols.forEach(symbol => {
            stockMetrics[symbol] = {
                accuracy: 0,
                precision: [0, 0, 0],
                recall: [0, 0, 0],
                f1: [0, 0, 0],
                totalPredictions: 0,
                correctPredictions: 0
            };
            
            confusionMatrices[symbol] = Array(3).fill().map(() => Array(3).fill(0));
        });

        // Calculate metrics per stock
        symbols.forEach((symbol, stockIdx) => {
            let correct = 0;
            let total = 0;
            const predictions = [];

            for (let i = 0; i < yTrueArray.length; i++) {
                for (let offset = 0; offset < horizon; offset++) {
                    const targetIdx = stockIdx * horizon + offset;
                    const trueVal = yTrueArray[i][targetIdx];
                    const predProbs = yPredArray[i].slice(targetIdx * 3, (targetIdx + 1) * 3);
                    const predVal = predProbs.indexOf(Math.max(...predProbs));
                    
                    // Update confusion matrix
                    confusionMatrices[symbol][trueVal][predVal]++;
                    
                    if (trueVal === predVal) {
                        correct++;
                        stockMetrics[symbol].correctPredictions++;
                    }
                    total++;
                    stockMetrics[symbol].totalPredictions++;

                    predictions.push({
                        true: trueVal,
                        trueLabel: this.classNames[trueVal],
                        pred: predVal,
                        predLabel: this.classNames[predVal],
                        confidence: Math.max(...predProbs),
                        correct: trueVal === predVal
                    });
                }
            }

            stockMetrics[symbol].accuracy = correct / total;
            
            // Calculate precision, recall, F1 for each class
            for (let classIdx = 0; classIdx < 3; classIdx++) {
                const tp = confusionMatrices[symbol][classIdx][classIdx];
                const fp = confusionMatrices[symbol].reduce((sum, row) => sum + row[classIdx], 0) - tp;
                const fn = confusionMatrices[symbol][classIdx].reduce((sum, val) => sum + val, 0) - tp;
                
                const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
                const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
                const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
                
                stockMetrics[symbol].precision[classIdx] = precision;
                stockMetrics[symbol].recall[classIdx] = recall;
                stockMetrics[symbol].f1[classIdx] = f1;
            }

            stockPredictions[symbol] = predictions;
        });

        return { 
            stockMetrics, 
            stockPredictions, 
            confusionMatrices,
            classNames: this.classNames 
        };
    }

    async predictFuture(X_last_sequence, daysAhead = 5) {
        if (!this.model) throw new Error('Model not trained');
        
        const predictions = [];
        let currentSequence = X_last_sequence.clone();
        
        for (let i = 0; i < daysAhead; i++) {
            const pred = this.model.predict(currentSequence);
            const predArray = await pred.array();
            predictions.push(predArray[0]);
            
            // Update sequence for next prediction (simplified approach)
            pred.dispose();
        }
        
        currentSequence.dispose();
        return predictions;
    }

    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

export default GRUModel;
