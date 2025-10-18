class DataLoader {
    constructor() {
        this.data = null;
        this.processedData = null;
        this.stores = new Set();
        this.features = ['Weekly_Sales', 'Holiday_Flag', 'Temperature', 'Fuel_Price', 'CPI', 'Unemployment'];
    }

    async loadCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const csv = e.target.result;
                    this.data = this.parseCSV(csv);
                    this.processedData = this.preprocessData(this.data);
                    this.extractStores();
                    resolve(this.processedData);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            
            headers.forEach((header, index) => {
                let value = values[index] ? values[index].trim() : '';
                
                // Convert numeric values
                if (['Weekly_Sales', 'Temperature', 'Fuel_Price', 'CPI', 'Unemployment'].includes(header)) {
                    value = parseFloat(value) || 0;
                } else if (header === 'Holiday_Flag') {
                    value = parseInt(value) || 0;
                } else if (header === 'Store') {
                    value = parseInt(value) || 0;
                }
                
                row[header] = value;
            });
            
            // Convert date
            if (row.Date) {
                row.timestamp = this.parseDate(row.Date);
            }
            
            data.push(row);
        }
        
        return data.sort((a, b) => a.timestamp - b.timestamp);
    }

    parseDate(dateStr) {
        // Handle DD-MM-YYYY format
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
        }
        return new Date(dateStr).getTime();
    }

    preprocessData(data) {
        // Group by store and sort by date
        const storeData = {};
        
        data.forEach(row => {
            const storeId = row.Store;
            if (!storeData[storeId]) {
                storeData[storeId] = [];
            }
            storeData[storeId].push(row);
        });

        // Sort each store's data by date
        Object.keys(storeData).forEach(storeId => {
            storeData[storeId].sort((a, b) => a.timestamp - b.timestamp);
        });

        return storeData;
    }

    extractStores() {
        this.stores = new Set(Object.keys(this.processedData));
    }

    getStoreData(storeId) {
        return this.processedData[storeId] || [];
    }

    getAllStores() {
        return Array.from(this.stores).map(id => parseInt(id)).sort((a, b) => a - b);
    }

    getDataPreview(limit = 10) {
        if (!this.data) return [];
        return this.data.slice(0, limit);
    }

    createSequence(storeData, startIndex, windowSize) {
        const sequence = [];
        for (let j = 0; j < windowSize; j++) {
            const point = storeData[startIndex + j];
            const features = this.features.map(feat => {
                // Правильная нормализация
                if (feat === 'Weekly_Sales') return point[feat] / 1000000;
                if (feat === 'Temperature') return point[feat] / 100;
                if (feat === 'Fuel_Price') return point[feat] / 10;
                if (feat === 'CPI') return point[feat] / 1000;
                if (feat === 'Unemployment') return point[feat] / 20;
                return point[feat];
            });
            sequence.push(features);
        }
        return sequence;
    }

    createTarget(storeData, startIndex, windowSize) {
        return [
            storeData[startIndex + windowSize].Weekly_Sales / 1000000,
            storeData[startIndex + windowSize + 1].Weekly_Sales / 1000000,
            storeData[startIndex + windowSize + 2].Weekly_Sales / 1000000
        ];
    }

    // 🔥 ИЗМЕНЕННЫЙ МЕТОД: Хронологическое разделение для каждого магазина
    prepareSequences(storeIds, windowSize, testSplit = 0.2) {
        const trainSequences = [];
        const trainTargets = [];
        const testSequences = [];
        const testTargets = [];
        const trainStoreIndices = [];
        const testStoreIndices = [];

        storeIds.forEach(storeId => {
            const storeData = this.getStoreData(storeId);
            if (storeData.length < windowSize + 3) {
                console.log(`Skipping store ${storeId}: insufficient data (${storeData.length} records)`);
                return;
            }

            // 🔥 Хронологическое разделение для каждого магазина
            const splitIndex = Math.floor(storeData.length * (1 - testSplit));
            
            // Train данные (ранний период)
            for (let i = 0; i < splitIndex - windowSize - 2; i++) {
                const sequence = this.createSequence(storeData, i, windowSize);
                const target = this.createTarget(storeData, i, windowSize);
                
                trainSequences.push(sequence);
                trainTargets.push(target);
                trainStoreIndices.push(storeId);
            }

            // Test данные (поздний период)
            for (let i = splitIndex; i < storeData.length - windowSize - 2; i++) {
                const sequence = this.createSequence(storeData, i, windowSize);
                const target = this.createTarget(storeData, i, windowSize);
                
                testSequences.push(sequence);
                testTargets.push(target);
                testStoreIndices.push(storeId);
            }

            console.log(`Store ${storeId}: train=${splitIndex - windowSize - 2}, test=${storeData.length - splitIndex - windowSize - 2}`);
        });

        if (trainSequences.length === 0 || testSequences.length === 0) {
            throw new Error('Not enough sequences generated. Check if stores have enough data.');
        }

        console.log(`Generated ${trainSequences.length} training and ${testSequences.length} test sequences from ${storeIds.length} stores`);
        console.log('Train store distribution:', this.countStores(trainStoreIndices));
        console.log('Test store distribution:', this.countStores(testStoreIndices));
        
        return {
            trainX: trainSequences,
            trainY: trainTargets,
            testX: testSequences,
            testY: testTargets,
            trainStoreIndices: trainStoreIndices,
            testStoreIndices: testStoreIndices,
            featureNames: this.features
        };
    }

    // 🔥 НОВЫЙ МЕТОД: Для validation данных во время обучения
    prepareTrainValSequences(storeIds, windowSize, validationSplit = 0.1) {
        const trainSequences = [];
        const trainTargets = [];
        const valSequences = [];
        const valTargets = [];
        const trainStoreIndices = [];
        const valStoreIndices = [];

        storeIds.forEach(storeId => {
            const storeData = this.getStoreData(storeId);
            if (storeData.length < windowSize + 3) return;

            // Разделение на train/validation внутри тренировочного периода
            const valSplitIndex = Math.floor(storeData.length * (1 - validationSplit));
            
            // Train данные (ранний период)
            for (let i = 0; i < valSplitIndex - windowSize - 2; i++) {
                const sequence = this.createSequence(storeData, i, windowSize);
                const target = this.createTarget(storeData, i, windowSize);
                
                trainSequences.push(sequence);
                trainTargets.push(target);
                trainStoreIndices.push(storeId);
            }

            // Validation данные (поздний период тренировочных данных)
            for (let i = valSplitIndex; i < storeData.length - windowSize - 2; i++) {
                const sequence = this.createSequence(storeData, i, windowSize);
                const target = this.createTarget(storeData, i, windowSize);
                
                valSequences.push(sequence);
                valTargets.push(target);
                valStoreIndices.push(storeId);
            }
        });

        // Перемешиваем только тренировочные данные
        const shuffledTrain = this.shuffleArrays(trainSequences, trainTargets, trainStoreIndices);

        return {
            trainX: shuffledTrain.sequences,
            trainY: shuffledTrain.targets,
            trainStoreIndices: shuffledTrain.storeIndices,
            valX: valSequences,
            valY: valTargets,
            valStoreIndices: valStoreIndices
        };
    }

    // Вспомогательный метод для перемешивания
    shuffleArrays(sequences, targets, storeIndices) {
        const indices = Array.from({length: sequences.length}, (_, i) => i);
        
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        
        return {
            sequences: indices.map(i => sequences[i]),
            targets: indices.map(i => targets[i]),
            storeIndices: indices.map(i => storeIndices[i])
        };
    }

    countStores(storeIndices) {
        const count = {};
        storeIndices.forEach(storeId => {
            count[storeId] = (count[storeId] || 0) + 1;
        });
        return count;
    }
}
