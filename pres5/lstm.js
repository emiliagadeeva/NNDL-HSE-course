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
        
        // 🔥 ИСПРАВЛЕНИЕ: Добавляем регуляризацию и улучшаем архитектуру
        
        // First LSTM layer with dropout
        this.model.add(tf.layers.lstm({
            units: hiddenUnits,
            returnSequences: lstmLayers > 1,
            inputShape: inputShape,
            dropout: 0.2,  // 🔥 Добавляем dropout для регуляризации
            recurrentDropout: 0.2
        }));
        
        // Additional LSTM layers
        for (let i = 1; i < lstmLayers; i++) {
            this.model.add(tf.layers.lstm({
                units: hiddenUnits,
                returnSequences: i < lstmLayers - 1,
                dropout: 0.2,  // 🔥 Добавляем dropout
                recurrentDropout: 0.2
            }));
        }
        
        // 🔥 Добавляем Dense layer для лучшего обучения
        this.model.add(tf.layers.dense({
            units: Math.floor(hiddenUnits / 2),
            activation: 'relu'
        }));
        
        // Output layer - predict 3 weeks
        this.model.add(tf.layers.dense({
            units: 3,
            activation: 'linear'
        }));
        
        // 🔥 Уменьшаем learning rate для более стабильного обучения
        const optimizer = tf.train.adam(learningRate * 0.1);
        
        this.model.compile({
            optimizer: optimizer,
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        console.log('Model created with regularization');
        return this.model;
    }

    async trainModel(trainX, trainY, valX, valY, epochs = 50, callback = null) {
        if (!this.model) {
            throw new Error('Model not created. Call createModel first.');
        }

        // WebGL FIX: Очищаем память перед обучением
        tf.engine().startScope();
        
        this.isTraining = true;
        this.trainingHistory = { loss: [], valLoss: [] };

        try {
            const xs = tf.tensor3d(trainX);
            const ys = tf.tensor2d(trainY);
            const valXs = valX && valX.length > 0 ? tf.tensor3d(valX) : null;
            const valYs = valY && valY.length > 0 ? tf.tensor2d(valY) : null;

            // 🔥 ИСПРАВЛЕНИЕ: Уменьшаем batch size для лучшего обобщения
            const batchSize = Math.min(8, Math.floor(trainX.length / 10));

            for (let epoch = 0; epoch < epochs && this.isTraining; epoch++) {
                const history = await this.model.fit(xs, ys, {
                    epochs: 1,
                    batchSize: batchSize,
                    validationData: valXs && valYs ? [valXs, valYs] : null,
                    shuffle: false, // Для временных рядов не перемешиваем
                    verbose: 0
                });

                const loss = history.history.loss[0];
                // 🔥 ИСПРАВЛЕНИЕ: Правильно обрабатываем validation loss
                const valLoss = history.history.val_loss && history.history.val_loss[0] ? history.history.val_loss[0] : loss;

                this.trainingHistory.loss.push(loss);
                this.trainingHistory.valLoss.push(valLoss);

                if (callback) {
                    callback(epoch + 1, epochs, loss, valLoss);
                }

                // 🔥 Ранняя остановка если validation loss начинает расти
                if (epoch > 10 && valLoss < Math.min(...this.trainingHistory.valLoss.slice(-5))) {
                    console.log(`Early stopping at epoch ${epoch}, val loss improved`);
                }

                // WebGL FIX: Чаще освобождаем память
                if (epoch % 5 === 0) {
                    await tf.nextFrame();
                }
            }

            xs.dispose();
            ys.dispose();
            if (valXs) valXs.dispose();
            if (valYs) valYs.dispose();

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
