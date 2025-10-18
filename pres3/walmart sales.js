class LSTMForecaster {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.trainingHistory = {
            loss: [],
            valLoss: []
        };
    }

    async createModel(inputShape, lstmLayers = 2, hiddenUnits = 32, learningRate = 0.1) {
        // Очищаем предыдущую модель
        if (this.model) {
            this.model.dispose();
        }
        
        this.model = tf.sequential();
        
        // First LSTM layer
        this.model.add(tf.layers.lstm({
            units: hiddenUnits,
            returnSequences: lstmLayers > 1,
            inputShape: inputShape
        }));
        
        // Additional LSTM layers
        for (let i = 1; i < lstmLayers; i++) {
            this.model.add(tf.layers.lstm({
                units: hiddenUnits,
                returnSequences: i < lstmLayers - 1
            }));
        }
        
        // Output layer - predict 3 weeks
        this.model.add(tf.layers.dense({
            units: 3,
            activation: 'linear'
        }));
        
        const optimizer = tf.train.adam(learningRate);
        
        this.model.compile({
            optimizer: optimizer,
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        return this.model;
    }

    // 🔥 СУЩЕСТВУЮЩИЙ МЕТОД: Для использования с validationSplit
    async trainModel(trainX, trainY, epochs = 50, validationSplit = 0.1, callback = null) {
        if (!this.model) {
            throw new Error('Model not created. Call createModel first.');
        }

        tf.engine().startScope();
        
        this.isTraining = true;
        this.trainingHistory = { loss: [], valLoss: [] };

        try {
            const xs = tf.tensor3d(trainX);
            const ys = tf.tensor2d(trainY);

            const batchSize = 16;

            for (let epoch = 0; epoch < epochs && this.isTraining; epoch++) {
                const history = await this.model.fit(xs, ys, {
                    epochs: 1,
                    batchSize: batchSize,
                    validationSplit: validationSplit,
                    shuffle: true,
                    verbose: 0
                });

                const loss = history.history.loss[0];
                const valLoss = history.history.val_loss ? history.history.val_loss[0] : loss;

                this.trainingHistory.loss.push(loss);
                this.trainingHistory.valLoss.push(valLoss);

                if (callback) {
                    callback(epoch + 1, epochs, loss, valLoss);
                }

                if (epoch % 5 === 0) {
                    await tf.nextFrame();
                }
            }

            xs.dispose();
            ys.dispose();

        } catch (error) {
            console.error('Training error:', error);
            throw error;
        } finally {
            tf.engine().endScope();
            this.isTraining = false;
        }
    }

    // 🔥 НОВЫЙ МЕТОД: Для обучения с явными validation данными
    async trainModelWithValidation(trainX, trainY, valX, valY, epochs = 50, callback = null) {
        if (!this.model) {
            throw new Error('Model not created. Call createModel first.');
        }

        tf.engine().startScope();
        
        this.isTraining = true;
        this.trainingHistory = { loss: [], valLoss: [] };

        try {
            const trainXs = tf.tensor3d(trainX);
            const trainYs = tf.tensor2d(trainY);
            const valXs = tf.tensor3d(valX);
            const valYs = tf.tensor2d(valY);

            const batchSize = 16;

            for (let epoch = 0; epoch < epochs && this.isTraining; epoch++) {
                // 🔥 Явно передаем validation данные
                const history = await this.model.fit(trainXs, trainYs, {
                    epochs: 1,
                    batchSize: batchSize,
                    validationData: [valXs, valYs],
                    shuffle: true,
                    verbose: 0
                });

                const loss = history.history.loss[0];
                const valLoss = history.history.val_loss[0];

                this.trainingHistory.loss.push(loss);
                this.trainingHistory.valLoss.push(valLoss);

                if (callback) {
                    callback(epoch + 1, epochs, loss, valLoss);
                }

                if (epoch % 5 === 0) {
                    await tf.nextFrame();
                }
            }

            trainXs.dispose();
            trainYs.dispose();
            valXs.dispose();
            valYs.dispose();

        } catch (error) {
            console.error('Training error:', error);
            throw error;
        } finally {
            tf.engine().endScope();
            this.isTraining = false;
        }
    }

    stopTraining() {
        this.isTraining = false;
    }

    async predict(testX) {
        if (!this.model) {
            throw new Error('Model not trained. Train the model first.');
        }

        const xs = tf.tensor3d(testX);
        const predictions = this.model.predict(xs);
        const results = await predictions.array();
        
        xs.dispose();
        predictions.dispose();
        
        return results;
    }

    calculateMetrics(predictions, actuals) {
        const rmse = [];
        const mae = [];
        
        for (let i = 0; i < predictions.length; i++) {
            let sumSquaredError = 0;
            let sumAbsoluteError = 0;
            
            for (let j = 0; j < predictions[i].length; j++) {
                const error = actuals[i][j] - predictions[i][j];
                sumSquaredError += error * error;
                sumAbsoluteError += Math.abs(error);
            }
            
            rmse.push(Math.sqrt(sumSquaredError / predictions[i].length));
            mae.push(sumAbsoluteError / predictions[i].length);
        }
        
        return { rmse, mae };
    }

    async evaluateByStore(predictions, actuals, storeIndices) {
        const storeMetrics = {};
        
        storeIndices.forEach((storeId, index) => {
            if (!storeMetrics[storeId]) {
                storeMetrics[storeId] = { predictions: [], actuals: [] };
            }
            
            storeMetrics[storeId].predictions.push(predictions[index]);
            storeMetrics[storeId].actuals.push(actuals[index]);
        });
        
        const results = {};
        Object.keys(storeMetrics).forEach(storeId => {
            const storeData = storeMetrics[storeId];
            const metrics = this.calculateMetrics(storeData.predictions, storeData.actuals);
            
            // Average RMSE across all predictions for this store
            const avgRMSE = metrics.rmse.reduce((a, b) => a + b, 0) / metrics.rmse.length;
            results[storeId] = {
                rmse: avgRMSE,
                predictions: storeData.predictions,
                actuals: storeData.actuals
            };
        });
        
        return results;
    }

    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}
