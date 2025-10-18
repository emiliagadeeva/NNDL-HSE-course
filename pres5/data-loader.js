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

   prepareSequences(storeIds, windowSize, trainSplit = 0.7) {
    const sequences = [];
    const targets = [];
    const storeIndices = [];
    const sequenceDates = []; // 🔥 НОВОЕ: храним даты последовательностей

    storeIds.forEach(storeId => {
        const storeData = this.getStoreData(storeId);
        if (storeData.length < windowSize + 3) {
            console.log(`Skipping store ${storeId}: insufficient data (${storeData.length} records)`);
            return;
        }

        // Создаем последовательности для каждого магазина
        const storeSequences = [];
        const storeTargets = [];
        const storeSequenceDates = [];
        
        for (let i = 0; i < storeData.length - windowSize - 2; i++) {
            const sequence = [];
            for (let j = 0; j < windowSize; j++) {
                const point = storeData[i + j];
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
            
            const target = [
                storeData[i + windowSize].Weekly_Sales / 1000000,
                storeData[i + windowSize + 1].Weekly_Sales / 1000000,
                storeData[i + windowSize + 2].Weekly_Sales / 1000000
            ];

            storeSequences.push(sequence);
            storeTargets.push(target);
            storeSequenceDates.push(storeData[i + windowSize].timestamp); // 🔥 Дата начала предсказания
        }

        // Добавляем все последовательности магазина с его ID
        sequences.push(...storeSequences);
        targets.push(...storeTargets);
        storeIndices.push(...Array(storeSequences.length).fill(storeId));
        sequenceDates.push(...storeSequenceDates);
    });

    if (sequences.length === 0) {
        throw new Error('No sequences generated. Check if stores have enough data.');
    }

    // 🔥 ИСПРАВЛЕНИЕ: Сортируем по дате вместо перемешивания
    const sorted = this.sortByDate(sequences, targets, storeIndices, sequenceDates);
    
    const trainEnd = Math.floor(sorted.sequences.length * trainSplit);
    const valEnd = trainEnd + Math.floor(sorted.sequences.length * 0.15);
    
    console.log(`Generated ${sorted.sequences.length} sequences from ${storeIds.length} stores`);
    console.log('Split:', {
        train: trainEnd,
        val: valEnd - trainEnd, 
        test: sorted.sequences.length - valEnd
    });
    
    return {
        trainX: sorted.sequences.slice(0, trainEnd),
        trainY: sorted.targets.slice(0, trainEnd),
        valX: sorted.sequences.slice(trainEnd, valEnd),
        valY: sorted.targets.slice(trainEnd, valEnd),
        testX: sorted.sequences.slice(valEnd),
        testY: sorted.targets.slice(valEnd),
        storeIndices: sorted.storeIndices.slice(valEnd), // test store indices
        featureNames: this.features
    };
}

// 🔥 НОВЫЙ МЕТОД: Сортировка по дате
sortByDate(sequences, targets, storeIndices, sequenceDates) {
    const indices = Array.from({length: sequences.length}, (_, i) => i);
    
    // Сортируем индексы по дате (от старых к новым)
    indices.sort((a, b) => sequenceDates[a] - sequenceDates[b]);
    
    return {
        sequences: indices.map(i => sequences[i]),
        targets: indices.map(i => targets[i]),
        storeIndices: indices.map(i => storeIndices[i])
    };
}
    

    // 🔥 НОВЫЙ МЕТОД: Подсчет магазинов в наборе данных
    countStores(storeIndices) {
        const count = {};
        storeIndices.forEach(storeId => {
            count[storeId] = (count[storeId] || 0) + 1;
        });
        return count;
    }
}
