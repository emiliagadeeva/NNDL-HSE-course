// gru.js
class SalesPredictor {
    constructor() {
        this.model = null;
        this.isTrained = false;
        this.trainingHistory = null;
    }

    createModel(sequenceLength, featureCount, outputSize) {
        const model = tf.sequential();
        
        // First LSTM layer
        model.add(tf.layers.lstm({
            units: 64,
            returnSequences: true,
            inputShape: [sequenceLength, featureCount]
        }));
        
        // Second LSTM layer
        model.add(tf.layers.lstm({
            units: 32,
            returnSequences: false
        }));
        
        // Dense layers
        model.add(tf.layers.dense({units: 64, activation: 'relu'}));
        model.add(tf.layers.dropout({rate: 0.2}));
        model.add(tf.layers.dense({units: 32, activation: 'relu'}));
        
        // Output layer - multi-output regression
        model.add(tf.layers.dense({
            units: outputSize,
            activation: 'linear'
        }));

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mse']
        });

        this.model = model;
        return model;
    }

    async train(X_train, y_train, X_test, y_test, epochs = 50, batchSize = 32, progressCallback = null) {
        if (!this.model) {
            throw new Error('Model not created. Call createModel first.');
        }

        this.trainingHistory = {
            losses: [],
            valLosses: [],
            epochs: []
        };

        for (let epoch = 0; epoch < epochs; epoch++) {
            const history = await this.model.fit(X_train, y_train, {
                epochs: 1,
                batchSize: batchSize,
                validationData: [X_test, y_test],
                shuffle: false,
                callbacks: {
                    onEpochEnd: async (epoch, logs) => {
                        this.trainingHistory.losses.push(logs.loss);
                        this.trainingHistory.valLosses.push(logs.val_loss);
                        this.trainingHistory.epochs.push(epoch);
                        
                        if (progressCallback) {
                            progressCallback({
                                epoch: epoch + 1,
                                totalEpochs: epochs,
                                loss: logs.loss,
                                valLoss: logs.val_loss,
                                progress: ((epoch + 1) / epochs) * 100
                            });
                        }
                    }
                }
            });
        }

        this.isTrained = true;
        return this.trainingHistory;
    }

    async predict(X) {
        if (!this.isTrained) {
            throw new Error('Model not trained yet.');
        }
        return this.model.predict(X);
    }

    evaluate(yTrue, yPred) {
        const rmse = tf.tidy(() => {
            const squaredErrors = yTrue.sub(yPred).square();
            const meanSquaredError = squaredErrors.mean();
            const rmse = meanSquaredError.sqrt();
            return rmse.dataSync()[0];
        });

        return rmse;
    }

    computePerStoreRMSE(yTrue, yPred, numStores, predictionHorizon) {
        const perStoreRMSE = [];
        
        tf.tidy(() => {
            for (let storeIdx = 0; storeIdx < numStores; storeIdx++) {
                let storeErrors = [];
                
                for (let horizon = 0; horizon < predictionHorizon; horizon++) {
                    const outputIdx = storeIdx * predictionHorizon + horizon;
                    const trueSlice = yTrue.slice([0, outputIdx], [yTrue.shape[0], [1, 1]);
                    const predSlice = yPred.slice([0, outputIdx], [yTrue.shape[0], [1, 1]);
                    
                    const squaredErrors = trueSlice.sub(predSlice).square();
                    const mse = squaredErrors.mean();
                    const rmse = mse.sqrt();
                    
                    storeErrors.push(rmse.dataSync()[0]);
                }
                
                perStoreRMSE.push({
                    store: storeIdx + 1,
                    rmse: storeErrors.reduce((a, b) => a + b, 0) / predictionHorizon,
                    horizons: storeErrors
                });
            }
        });

        return perStoreRMSE.sort((a, b) => a.rmse - b.rmse);
    }

    async saveModel() {
        if (!this.isTrained) {
            throw new Error('No trained model to save');
        }
        return await this.model.save('downloads://walmart-sales-model');
    }

    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

export default SalesPredictor;
