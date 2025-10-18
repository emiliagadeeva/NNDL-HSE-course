[file name]: lstm.js
[file content begin]
class LSTMForecaster {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.trainingHistory = {
            loss: [],
            valLoss: []
        };
    }

    createModel(inputShape, lstmLayers = 2, hiddenUnits = 32, learningRate = 0.1) {
        const model = tf.sequential();
        
        // First LSTM layer
        model.add(tf.layers.lstm({
            units: hiddenUnits,
            returnSequences: lstmLayers > 1,
            inputShape: inputShape
        }));
        
        // Additional LSTM layers
        for (let i = 1; i < lstmLayers; i++) {
            model.add(tf.layers.lstm({
                units: hiddenUnits,
                returnSequences: i < lstmLayers - 1
            }));
        }
        
        // Output layer - 3 units for 3-week forecast
        model.add(tf.layers.dense({
            units: 3,
            activation: 'linear'
        }));
        
        // Компиляция модели с правильными параметрами
        const optimizer = tf.train.adam(learningRate);
        model.compile({
            optimizer: optimizer,
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        console.log('Model created successfully');
        model.summary();
        
        return model;
    }

    async train(trainingData, config, onProgress) {
        if (this.isTraining) {
            throw new Error('Model is already training');
        }

        this.isTraining = true;
        
        try {
            const { trainX, trainY, testX, testY } = trainingData;
            
            if (trainX.length === 0 || trainY.length === 0) {
                throw new Error('No training data available');
            }

            // Convert to tensors
            const xs = tf.tensor3d(trainX);
            const ys = tf.tensor2d(trainY);
            
            let valXs, valYs;
            if (testX.length > 0 && testY.length > 0) {
                valXs = tf.tensor3d(testX);
                valYs = tf.tensor2d(testY);
            }

            console.log(`Training on ${trainX.length} sequences`);
            console.log(`Input shape: [${trainX.length}, ${trainX[0].length}, ${trainX[0][0].length}]`);
            console.log(`Output shape: [${trainY.length}, ${trainY[0].length}]`);

            // Create or recreate model
            const inputShape = [config.windowSize, trainX[0][0].length];
            if (this.model) {
                this.model.dispose();
            }
            this.model = this.createModel(inputShape, config.lstmLayers, config.hiddenUnits, config.learningRate);

            // Training configuration
            const trainConfig = {
                epochs: config.epochs,
                batchSize: 32,
                validationData: valXs && valYs ? [valXs, valYs] : undefined,
                callbacks: {
                    onEpochEnd: async (epoch, logs) => {
                        console.log(`Epoch ${epoch + 1}/${config.epochs} - loss: ${logs.loss.toFixed(4)}${logs.val_loss ? ` - val_loss: ${logs.val_loss.toFixed(4)}` : ''}`);
                        
                        this.trainingHistory.loss.push(logs.loss);
                        if (logs.val_loss) {
                            this.trainingHistory.valLoss.push(logs.val_loss);
                        }
                        
                        if (onProgress) {
                            onProgress(epoch + 1, logs.loss, logs.val_loss);
                        }
                        
                        // Принудительная очистка памяти
                        if (epoch % 5 === 0) {
                            await tf.nextFrame();
                        }
                    }
                }
            };

            // Start training
            await this.model.fit(xs, ys, trainConfig);

            // Cleanup
            xs.dispose();
            ys.dispose();
            if (valXs) valXs.dispose();
            if (valYs) valYs.dispose();

        } catch (error) {
            console.error('Training error:', error);
            throw error;
        } finally {
            this.isTraining = false;
        }
    }

    async test(trainingData) {
        if (!this.model) {
            throw new Error('Model not trained');
        }

        const { testX, testY, storeIndices } = trainingData;
        
        if (testX.length === 0) {
            throw new Error('No test data available');
        }

        console.log(`Testing on ${testX.length} sequences`);

        // Convert to tensors
        const xs = tf.tensor3d(testX);
        const ys = tf.tensor2d(testY);

        // Make predictions
        const predictions = this.model.predict(xs);
        const predData = await predictions.array();
        const actualData = await ys.array();

        // Calculate RMSE per store
        const storeRMSE = {};
        const storePredictions = {};

        storeIndices.forEach((storeId, index) => {
            if (!storeRMSE[storeId]) {
                storeRMSE[storeId] = [];
                storePredictions[storeId] = {
                    predicted: [],
                    actual: []
                };
            }

            const pred = predData[index];
            const actual = actualData[index];
            
            // Calculate RMSE for this prediction
            const squaredErrors = pred.map((p, i) => Math.pow(p - actual[i], 2));
            const mse = squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length;
            const rmse = Math.sqrt(mse);
            
            storeRMSE[storeId].push(rmse);
            storePredictions[storeId].predicted.push(pred);
            storePredictions[storeId].actual.push(actual);
        });

        // Average RMSE per store
        Object.keys(storeRMSE).forEach(storeId => {
            const rmses = storeRMSE[storeId];
            storeRMSE[storeId] = rmses.reduce((a, b) => a + b, 0) / rmses.length;
        });

        // Calculate overall RMSE
        const allPredictions = predData.flat();
        const allActuals = actualData.flat();
        const overallSquaredErrors = allPredictions.map((p, i) => Math.pow(p - allActuals[i], 2));
        const overallMSE = overallSquaredErrors.reduce((a, b) => a + b, 0) / overallSquaredErrors.length;
        const overallRMSE = Math.sqrt(overallMSE);

        // Cleanup
        xs.dispose();
        ys.dispose();
        predictions.dispose();

        console.log('Overall RMSE:', overallRMSE);
        console.log('Store RMSE:', storeRMSE);

        return {
            overallRMSE,
            storeRMSE,
            storePredictions,
            testSize: testX.length
        };
    }

    async predict(sequence) {
        if (!this.model) {
            throw new Error('Model not trained');
        }

        const tensor = tf.tensor3d([sequence]);
        const prediction = this.model.predict(tensor);
        const result = await prediction.array();
        
        tensor.dispose();
        prediction.dispose();
        
        return result[0];
    }

    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
    }
}
[file content end]
